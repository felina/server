var _ = require('underscore');
var errors = require('./error.js');
var images = require('./images.js');
var async = require('async');
//
function isUnset(x) {
    return _.isUndefined(x) || _.isNull(x);
}

function Point(x, y) {
    this.x = x;
    this.y = y;
}

// Takes a position, length, width and converts to standard poly representation.
function parseRectangle(rect) {
    if (_.isObject(rect.pos) && _.isObject(rect.size)) {
        var x = parseInt(rect.pos.x);
        var y = parseInt(rect.pos.y);
        var w = parseInt(rect.size.width);
        var h = parseInt(rect.size.height);

        if (_.isNaN(x + y + w + h) || x < 0 || y < 0 || w < 1 || h < 1) {
            console.log('Invalid rectangle params.');
            return false;
        } else {
            var origin = new Point(x,y);
            return [
                origin,
                new Point(x+w,y),
                new Point(x+w,y+h),
                new Point(x,y+h),
                origin
            ];
        }
    } else {
        return false;
    }
}

function parseRegion(reg) {
    // We should have already checked the size of this array.
    for (var i = 0; i < reg.length; i++) {
        if (reg[i] === null || typeof reg[i].x !== 'number' ||
            typeof reg[i].y !== 'number' || reg[i].x < 0 || reg[i].y < 0) {
            // If any point is invalid, invalidate the entire region.
            console.log('Invalid point in region.');
            return false;
        }
    }

    // For polygons (i.e. length > 2), the final point should match the first.
    // If we want to support more geoms, e.g. linestrings, this must change.
    if (reg.length > 2 && (reg[reg.length - 1].x !== reg[0].x || reg[reg.length - 1].y !== reg[0].y)) {
        reg.push(reg[0]);
    }

    return true;
}

// Assuming simplified format from image-annotator/#1
function parseAnno(an) {
    // Type must be valid and must match the points list.
    switch (an.type) {
    case 'rect':
        var rect = parseRectangle(an);
        if (rect === false) {
            return false;
        } else {
            an.points = rect;
            return true;
        }
        break;
    case 'poly':
        if (an.points.length >= 2) {
            return parseRegion(an.points);
        }
        return false;
    default:
        console.log('Unrecognised annotation shape: ' + an.type);
        return false;
    }
}

function parseAnnotations(an) {
    var val;
    // An empty array is valid, so we just return.
    for (var key in an) {
        // Discard any inherited properties
        if (an.hasOwnProperty(key)) {
            val = an[key];

            // Anno must be an object with an array 'shapes'
            if (_.isObject(val) && _.isArray(val.shapes)) {
                // TODO: Support multiple regions per key.
                var valid = parseAnno(val.shapes[0]);

                if (valid === false) {
                    an[key] = false;
                }
            } else {
                an[key] = false;
            }
        }
    }
}

function parseMetadata(mdObj) {
    if (!_.isObject(mdObj)) {
        console.log('Metadata not an object.');
        return false;
    } else {
        for (var id in mdObj) {
            if (mdObj.hasOwnProperty(id)) {
                if (typeof id === 'string' && id.length === 32) {
                    var md = mdObj[id];
                    // Check if title has been sent
                    if (isUnset(md.metadata.title)) {
                        // Mark as unset
                        md.metadata.title = null;
                    } else if (typeof md.metadata.title !== 'string') {
                        md.metadata.title = false;
                    }
                    
                    // Check if datetime has been sent
                    if (!isUnset(md.metadata.datetime)) {
                        md.metadata.datetime = Date.parse(md.metadata.datetime);
                        if (isNaN(md.metadata.datetime)) {
                            console.log('Failed to parse datetime field.');
                            // Mark as invalid
                            md.metadata.datetime = false;
                        } else {
                            // Convert to Date object.
                            md.metadata.datetime = new Date(md.metadata.datetime);
                        }
                    } else {
                        // Mark as unset
                        md.metadata.datetime = null;
                    }
                    
                    // Check if location has been sent
                    if (!isUnset(md.metadata.location)) {
                        if (typeof md.metadata.location !== 'object' || typeof md.metadata.location.coords !== 'object' ||
                            typeof md.metadata.location.coords.lat === 'undefined' ||
                            typeof md.metadata.location.coords.lng === 'undefined' ||
                            md.metadata.location.coords.lat < -90 || md.metadata.location.coords.lat > 90 ||
                            md.metadata.location.coords.lng < -180 || md.metadata.location.coords.lng > 180) {
                            console.log('Invalid location.');
                            // Mark as invalid
                            md.metadata.location = false;
                        }
                    } else {
                        // Mark as unset
                        md.metadata.location = null;
                    }
                    
                    // Check if priv has been sent
                    if (!isUnset(md.metadata.priv)) {
                        // Accept any type for priv, convert to a simple boolean.
                        md.metadata.priv = !! md.metadata.priv;
                    } else {
                        // Mark as unset
                        md.metadata.priv = null;
                    }
                    
                    // Check if annotations have been sent
                    if (!isUnset(md.annotations)) {
                        if (_.isObject(md.annotations)) {
                            // Parse annotations list
                            parseAnnotations(md.annotations);
                        } else {
                            console.log('Invalid annotations.');
                            md.annotations = false;
                        }
                    } else {
                        // Mark as unset
                        md.annotations = [];
                    }
                } else {
                    console.log('No id specified for metadata.');
                    mdObj[id] = false;
                    console.log(mdObj);
                }
            }
        }
    }
    return mdObj;
}

function parseQueryCombine(parsed, qRes, onSuccess, callback) {
    var ret = _.map(qRes, function(val, i) {
        return (val[1] === false) ? false : _.pairs(parsed)[i];
    });

    async.each(ret,
               function(ele, acallback) {
                   if (ele[1] && ele[1].metadata.priv !== null) {
                       // Success in setting metadata. Call on success to move the image to the other bucket.
                       return onSuccess(ele[0], ele[1].metadata.priv, acallback);
                   }

                   return acallback();
               },
               function(err) {
                   if (err) {
                       console.log(err);
                       return callback(err);
                   }
                   return callback(ret);
               });
}

function metaRoutes(app, auth, db) {

    // Takes an array of metadata objects (JSON). A metadata object must contain a 32 character id string,
    // and any combination of the following:
    //   - title    : A string name of the image for display only.
    //   - datetime : A string representing the date an image was captured. Create using (new Date).toJSON()
    //   - location : An object containing coords of lat and lon, and a name. Must be within +-90 and +-180 respectively.
    //   - private  : A boolean value determining whether other users may view this image.
    //   - annotations : An object containing name:annotation key value pairs.
    // An annotation object is comprised of two properties:
    //   - type   : A string giving the shape the points should form.
    //   - points : A list containing at least one point object, where a point simply wraps two numbers, x and y.
    // The four properties of a metadata object are all optional. If you do not wish to set one of these properties,
    // the property should be left undefined or set to null.
    app.post('/upload/metadata', auth.enforceLogin, function(req, res) {
        console.log('META UP');
        console.log(JSON.stringify(req.body));
        console.log('META DOWN');
        // Check that we've been sent an array
        if (parseMetadata(req.body) === false) {
            res.send(new errors.APIErrResp(2, 'Invalid request.'));
        } else {
            var asParsed = _.clone(req.body); // Use slice() to shallow copy the array, so we don't lose it's contents.
            db.addImageMeta(req.user.id, req.body, function(sqlRes) {
                // sqlRes = Array of booleans
                // asParsed = resultant parsed request
                var errPresent = _.every(sqlRes); // TODO: Check for adjustments made in parser.
                // TODO: res behaviour is inconsistent
                parseQueryCombine(asParsed, sqlRes, images.setAccess, function(combined) {
                    res.send({
                        'res': errPresent,
                        'detail': combined
                    });
                });
            });
        }
    });

    // Deprecated
    app.get('/img/:id/meta', function(req, res) {
        return res.redirect('/meta?id=' + req.params.id);
    });

    app.get('/meta', function(req, res) {
        var uid = req.user ? req.user.id : -1;
        var iid = req.query.id;

        db.getMetaBasic(uid, iid, function(err, meta) {
            if (err) {
                res.send(new errors.APIErrResp(3, 'Failed to retrieve metadata.'));
            } else if (meta === false) {
                res.send(new errors.APIErrResp(1, 'You do not have permission to access this image.'));
            } else {
                res.send({
                    'res': true,
                    'meta': meta
                });
            }
        });
    });

    // Deprecated
    app.get('/img/:id/anno', function(req, res) {
        return res.redirect('/anno?id=' + req.params.id);
    });

    app.get('/anno', function(req, res) {
        var uid = req.user ? req.user.id : -1;
        var iid = req.query.id;

        db.checkImagePerm(uid, iid, function(err, bool) {
            if (bool) {
                db.getAnnotations(iid, function(err, anno) {
                    if (err) {
                        res.send(new errors.APIErrResp(2, 'Failed to retrieve metadata.'));
                    } else {
                        res.send({
                            'res': true,
                            'anno': anno
                        });
                    }
                });
            } else {
                res.send(new errors.APIErrResp(1, 'You do not have permission to access this image.'));
            }
        });
    });

    app.get('/fields', function(req, res) {
        var uid = req.user ? req.user.id : -1;
        var iid = req.query.id;

        db.checkImagePerm(uid, iid, function(err, bool) {
            if (bool) {
                db.getImageFields(iid, function(err, anno) {
                    if (err) {
                        res.send(new errors.APIErrResp(2, 'Failed to retrieve metadata.'));
                    } else {
                        res.send({
                            'res': true,
                            'fields': anno
                        });
                    }
                });
            } else {
                res.send(new errors.APIErrResp(1, 'You do not have permission to access this image.'));
            }
        });
    });

    // To be replaced by /project/fields
    app.get('/features', function(req, res) {
        res.send({
            res: true,
            features: [{
                name: 'tail',
                required: false,
                shape: 'poly'
            }, {
                name: 'eyes',
                required: true,
                shape: 'rect'
            }, {
                name: 'feet',
                required: true,
                shape: 'rect'
            }, {
                name: 'neck',
                required: false,
                shape: 'poly'
            }, {
                name: 'nose',
                required: true,
                shape: 'any'
            }]
        });
    });
}

module.exports = {
    metaRoutes: metaRoutes
};

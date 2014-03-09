var _ = require('underscore');
var errors = require('./error.js');

function isUnset(x) {
    return _.isUndefined(x) || _.isNull(x);
}

// Takes a position, length, width and converts to standard poly representation.
//function convertRectangle(rect) {
//    return rect;
//}

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
    if (!_.isArray(an.points)) {
        // Points must be set.
        return false;
    } else {
        // Type must be valid and must match the points list.
        switch (an.type) {
        case 'rect':
            if (an.points.length === 4) {
                return parseRegion(an.points);
            }
            return false;
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
}

function parseAnnotations(an) {
    var val;
    // An empty array is valid, so we just return.
    for (var key in an) {
        // Discard any inherited properties
        if (an.hasOwnProperty(key)) {
            val = an[key];

            // Anno must be am object
            if (_.isObject(val)) {
                // TODO: Support multiple regions per key.
                var valid = parseAnno(val[0]);

                if (!valid) {
                    an[key] = false;
                }
            } else {
                an[key] = false;
            }
        }
    }
}

function parseMetadata(mdArr) {
    if (!_.isArray(mdArr)) {
        console.log('Metadata not a list.');
        return false;
    } else {
        for (var i = 0; i < mdArr.length; i++) {
            if (typeof mdArr[i].id === 'string' && mdArr[i].id != null && mdArr[i].id.length === 32) {
                // Check if title has been sent
                if (isUnset(mdArr[i].metadata.title)) {
                    // Mark as unset
                    mdArr[i].metadata.title = null;
                } else if (typeof mdArr[i].metadata.title !== 'string') {
                    mdArr[i].metadata.title = false;
                }

                // Check if datetime has been sent
                if (!isUnset(mdArr[i].metadata.datetime)) {
                    mdArr[i].metadata.datetime = Date.parse(mdArr[i].metadata.datetime);
                    if (isNaN(mdArr[i].metadata.datetime)) {
                        console.log('Failed to parse datetime field.');
                        // Mark as invalid
                        mdArr[i].metadata.datetime = false;
                    } else {
                        // Convert to Date object.
                        mdArr[i].metadata.datetime = new Date(mdArr[i].metadata.datetime);
                    }
                } else {
                    // Mark as unset
                    mdArr[i].metadata.datetime = null;
                }

                // Check if location has been sent
                if (!isUnset(mdArr[i].metadata.location)) {
                    if (typeof mdArr[i].metadata.location !== 'object' || typeof mdArr[i].metadata.location.coords !== 'object' ||
                        typeof mdArr[i].metadata.location.coords.lat === 'undefined' ||
                        typeof mdArr[i].metadata.location.coords.lng === 'undefined' ||
                        mdArr[i].metadata.location.coords.lat < -90 || mdArr[i].metadata.location.coords.lat > 90 ||
                        mdArr[i].metadata.location.coords.lng < -180 || mdArr[i].metadata.location.coords.lng > 180) {
                        console.log('Invalid location.');
                        // Mark as invalid
                        mdArr[i].metadata.location = false;
                    }
                } else {
                    // Mark as unset
                    mdArr[i].metadata.location = null;
                }

                // Check if priv has been sent
                if (!isUnset(mdArr[i].metadata.priv)) {
                    // Accept any type for priv, convert to a simple boolean.
                    mdArr[i].metadata.priv = !! mdArr[i].metadata.priv;
                } else {
                    // Mark as unset
                    mdArr[i].metadata.priv = null;
                }

                // Check if annotations have been sent
                if (!isUnset(mdArr[i].annotations)) {
                    if (_.isObject(mdArr[i].annotations)) {
                        // Parse annotations list
                        parseAnnotations(mdArr[i].annotations);
                    } else {
                        console.log('Invalid annotations.');
                        mdArr[i].annotations = false;
                    }
                } else {
                    // Mark as unset
                    mdArr[i].annotations = [];
                }
            } else {
                console.log('No id specified for metadata.');
                mdArr[i] = false;
            }
        }
    }
    return mdArr;
}

function parseQueryCombine(parsed, qRes) {
    return _.map(qRes, function(val, i) {
        return (val === false) ? false : parsed[i];
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
        // Check that we've been sent an array
        if (parseMetadata(req.body) === false) {
            res.send(new errors.APIErrResp(2, 'Invalid request.'));
        } else {
            var asParsed = req.body.slice(); // Use slice() to shallow copy the array, so we don't lose it's contents.
            db.addImageMeta(req.body, function(sqlRes) {
                // sqlRes = Array of booleans
                // asParsed = resultant parsed request
                var errPresent = _.every(sqlRes); // TODO: Check for adjustments made in parser.
                // TODO: res behaviour is inconsistent
                res.send({
                    'res': errPresent,
                    'detail': parseQueryCombine(asParsed, sqlRes)
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

    app.get('/species', function(req, res) {
        res.send({
            res: true,
            species: [
                'Elephant', 'Penguin', 'Giraffe'
            ]
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

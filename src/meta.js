var _ = require('underscore');
var errors = require('./error.js');

function isUnset(x) {
    return _.isUndefined(x) || _.isNull(x);
}

function parseRegion(reg) {
    // We should have already checked the size of this array.
    for (var i = 0; i < reg.length; i++) {
        if (reg[i] == null || typeof reg[i].x !== 'number' ||
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

function parseAnnotations(an) {
    // An empty array is valid, so we just return.
    for (var i = 0; i < an.length; i++) {
        // Region must be set and must be an array of size > 0
        if (_.isArray(an[i].region) && an[i].region.length > 0) {
            var valid = parseRegion(an[i].region);

            if (!valid) {
                an[i] = false;
            } else if (isUnset(an[i].tag)) {
                an[i].tag = null;
            } else if (typeof an[i].tag !== 'string' || an[i].tag.length < 1 || an[i].tag.length > 32) {
                an[i].tag = false;
            }
        } else {
            an[i] = false;
        }
    }
}

function parseMetadata(mdArr) {
    if (!_.isArray(mdArr)) {
        console.log('Metadata not a list.');
        return false;
    } else {
        // This is very un-node like. array.forEach(...)!
        for (var i = 0; i < mdArr.length; i++) {
            if (typeof mdArr[i].id === 'string' && mdArr[i].id != null && mdArr[i].id.length === 32) {
                // Check if datetime has been sent
                if (!isUnset(mdArr[i].datetime)) {
                    mdArr[i].datetime = Date.parse(mdArr[i].datetime);
                    if (isNaN(mdArr[i].datetime)) {
                        console.log('Failed to parse datetime field.');
                        // Mark as invalid
                        mdArr[i].datetime = false;
                    } else {
                        // Convert to Date object.
                        mdArr[i].datetime = new Date(mdArr[i].datetime);
                    }
                } else {
                    // Mark as unset
                    mdArr[i].datetime = null;
                }

                // Check if location has been sent
                if (!isUnset(mdArr[i].location)) {
                    if (typeof mdArr[i].location !== 'object' || typeof mdArr[i].location.lat === 'undefined' ||
                        typeof mdArr[i].location.lon === 'undefined' || mdArr[i].location.lat < -90 ||
                        mdArr[i].location.lat > 90 || mdArr[i].location.lon < -180 || mdArr[i].location.lon > 180) {
                        console.log('Invalid location.');
                        // Mark as invalid
                        mdArr[i].location = false;
                    }
                } else {
                    // Mark as unset
                    mdArr[i].location = null;
                }

                // Check if priv has been sent
                if (!isUnset(mdArr[i].priv)) {
                    // Accept any type for priv, convert to a simple boolean.
                    mdArr[i].priv = !! mdArr[i].priv;
                } else {
                    // Mark as unset
                    mdArr[i].priv = null;
                }

                // Check if annotations have been sent
                if (!isUnset(mdArr[i].annotations)) {
                    if (!_.isArray(mdArr[i].annotations)) {
                        console.log('Invalid annotations.');
                        mdArr[i].annotations = false;
                    } else {
                        // Parse annotations list
                        parseAnnotations(mdArr[i].annotations);
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
    //   - datetime : A string representing the date an image was captured. Create using (new Date).toJSON()
    //   - location : An object containing two numbers, lat and lon. Must be within +-90 and +-180 respectively.
    //   - private  : A boolean value determining whether other users may view this image.
    //   - annotations : A list containing annotation objects.
    // An annotation object is comprised of two properties:
    //   - tag    : (OPTIONAL) A string that describes the annotation. Will be replaced with an id in future.
    //   - region : A list containing at least one point object, where a point simply wraps two numbers, x and y.
    // The four properties of a metadata object are all optional. If you do not wish to set one of these properties,
    // the property should be left undefined or set to null.
    app.post('/upload/metadata', auth.enforceLogin, function(req, res) {
        // Check that we've been sent an array
        if (parseMetadata(req.body) === false) {
            res.send({
                'res': false,
                'err': new errors.APIError(1, 'Invalid request.')
            });
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

    app.get('/img/:id/meta', function(req, res) {
        // TODO: Allow logged out viewing
        if (req.user) {
            db.checkImagePerm(req.user, req.params.id, function(err, bool) {
                if (bool) {
                    db.getMetaBasic(req.user.id, req.params.id, function(err, meta) {
                        if (err) {
                            res.send({
                                'res': false,
                                'err': new errors.APIError(3, 'Failed to retrieve metadata.')
                            });
                        } else {
                            res.send({
                                'res': true,
                                'meta': meta
                            });
                        }
                    });
                } else {
                    res.send({
                        'res': false,
                        'err': new errors.APIError(2, 'You do not have permission to access this image.')
                    });
                }
            });
        } else {
            res.send({
                'res': false,
                'err': new errors.APIError(1, 'You are not logged in.')
            });
        }
    });

    app.get('/img/:id/anno', function(req, res) {
        if (req.user) {
            db.getAnnotations(req.user.id, req.params.id, function(err, anno) {
                if (err) {
                    res.send({
                        'res': false,
                        'err': new errors.APIError(2, 'Failed to retrieve metadata.')
                    });
                } else {
                    res.send({
                        'res': true,
                        'anno': anno
                    });
                }
            });
        } else {
            res.send({
                'res': false,
                'err': new errors.APIError(1, 'You are not logged in.')
            });
        }
    });

    app.get('/species', function(req, res) {
        res.send({
            res: true,
            species: [
                'Elephant', 'Penguin', 'Giraffe'
            ]
        });
    });
}

module.exports = {
    metaRoutes: metaRoutes
};

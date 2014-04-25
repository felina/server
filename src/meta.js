/**
 * @module meta
 */

var _ = require('underscore');
var errors = require('./error.js');
var images = require('./images.js');
var async = require('async');
var auth = require('./auth/auth.js');
var db = require('./db.js');

/**
 * Utility function to check if a variable is null or undefined.
 * @param {*} x - Any value
 * @returns {boolean} Whether x is undefined or null.
 */
function isUnset(x) {
    return _.isUndefined(x) || _.isNull(x);
}

/**
 * Represents a point as cartesian coordinates.
 * @constructor
 * @param {number} x - The x coordinate.
 * @param {number} y - The y coordinate.
 */
function Point(x, y) {
    this.x = x;
    this.y = y;
}

/**
 * @typedef Size
 * @type {object}
 * @property {number} width - The width of the object.
 * @property {number} height - The height of the object.
 */

/**
 * @typedef Rectangle
 * @type {object}
 * @property {Point} pos - The position of the NW corner of the rectangle.
 * @property {Size} size - The dimensions of the rectangle.
 */

/**
 * Takes the position and dimensions of a rectangle and converts to standard poly representation.
 * @param {Rectangle} rect - The rectangle to convert.
 * @returns {boolean|Point[]} The list of vertices, or false if the rectangle is invalid.
 */
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

/**
 * Parses and validates a region from an annotation. The system sanitises polygons by ensuring 
 * the final point matches the initial point.
 * @param {Point[]} reg - The list of points that form the region.
 * @returns {boolean} True iff all points in the region were valid.
 */
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

/**
 * @typedef Annotation
 * @type {object}
 * @property {string} type - String representation of the annotation type (i.e. rect, poly or point).
 * @property {Point[]} [points] - The points that form the shape. Will be added in case of types that use alternative an alternative format (i.e. rect).
 * @property {Point} [pos] - The position of the NW corner of the rectangle. Type 'rect' only.
 * @property {Size} [size] - The dimensions of the rectangle. Type 'rect' only.
 */

/**
 * Parses and validates an annotation. If the annotation is a rectangle, it will be converted to poly form by {@link parseRectangle}.
 * @param {Annotation} an - An annotation of an image.
 * @returns {boolean} True iff the annotation was valid, including the inner region.
 */
function parseAnno(an) {
    // Type must be valid and must match the points list.
    switch (an.type) {
    case 'point':
        if (an.points.length === 1) {
            return parseRegion(an.points);
        } else {
            return false;
        }
        break;
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
        } else {
            return false;
        }
        break;
    default:
        console.log('Unrecognised annotation shape: ' + an.type);
        return false;
    }
}

/**
 * @typedef AnnotationWrapper
 * @type {object}
 * @property {Annotation[]} shapes - A list of annotations for this key. Currently only a length of one is supported.
 */

/**
 * Parses and validates a set of annotations. Calls {@link parseAnnotation} for validation.
 * @param {Object.<string, AnnotationWrapper>} an - An object mapping string field names to annotation objects.
 * @returns {Object.<string, boolean>} An object mapping the field names to the result of parsing each annotation value.
 */
function parseAnnotations(an) {
    for (var key in an) {
        // Discard any inherited properties
        if (an.hasOwnProperty(key)) {
            var val = an[key];

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

/**
 * @typedef MetadataWrapper
 * @type {object}
 * @property {ImageMeta} metadata - The basic metadata of the image. 
 * @property {Object.<string, AnnotationWrapper>} an - An object mapping string field names to annotation objects.
 */

/**
 * Parses and validates metadata of an image. Delegates to {@link parseAnnotations} to handle annotations.
 * @param {Object.<string, MetadataWrapper>} mdObj - The object mapping image ids to the metadata to assign to them.
 * @returns {boolean|Object.<string, MetadataWrapper>} False iff mdObj is not an object. Otherwise, the supplied mdObj, with any adjustments or conversions, and any invalid properties replaced with boolean false.
 */
function parseMetadata(mdObj) {
    if (!_.isObject(mdObj)) {
        console.log('Metadata not an object.');
        return false;
    } else {
        // Loop through all image ids, skipping any external properties.
        for (var id in mdObj) {
            if (mdObj.hasOwnProperty(id)) {
                // Check that the id is valid.
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

/**
 * Metadata update result combination callback.
 * @callback parseQueryCombineCallback
 * @param {Error|boolean[]} The error, if one occurred, else the list of booleans showing which updates succeeded.
 */

/**
 * Combines the output of the metadata parser stack and the database action. Calls a method for each successful element.
 * @param {boolean|Object.<string, MetadataWrapper>} The resultant object from {@link parseMetadata}.
 * @param {boolean[]} The record of success/failure for all previous metadata updates, as returned by {@link db.updateMetaR}.
 * @param {function} onSuccess - The function that handles successful updates, and sets an image's access controls.
 * @param {parseQueryCombineCallback} callback - The callback that handles the final success/failure state of each update.
 */
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

/***
 ** API ROUTE FUNCTIONS
 **/

/**
 * @typedef MetadataSetAPIResponse
 * @type {object}
 * @property {boolean} res - True iff all the provided metadata objects were successfully parsed and set.
 * @property {APIError} [err] - Present only when the entire request could not be parsed.
 * @property {boolean[]} [detail] - The results of each individual update operation.
 */

/**
 * API endpoint to set metadata on images, including adding annotations. Multiple images may be updated
 * in a single request. In case of erroneous inputs, parts of the request will be ignored.
 * @hbcsapi {POST} meta - This is an API endpoint.
 * @deprecated
 * @param {Object.<string, MetadataWrapper>} * - The body of the request should map image ids to the metadata to assign.
 * @returns {MetadataSetAPIResponse} The API response detailing which, if any, of the images successfully updated.
 */
function postMeta(req, res) {
    // Check that we've been sent an array
    if (parseMetadata(req.body) === false) {
        res.send(new errors.APIErrResp(2, 'Invalid request.'));
    } else {
        var asParsed = _.clone(req.body); // Use slice() to shallow copy the array, so we don't lose it's contents.
        db.addImageMeta(req.user, req.body, function(sqlRes) {
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
}

/**
 * @typedef MetadataGetAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the user has permission to access the image and the retrieval succeeded.
 * @property {APIError} [err] - The error that caused the request to fail.
 * @property {ImageMeta} [meta] - The metadata we have stored for the image.
 */

/**
 * API endpoint to fetch basic metadata stored for an image.
 * @hbcsapi {GET} /images/:iid/metas - This is an API endpoint. 
 * @param {string} :iid - The image id to lookup.
 * @returns {MetadataGetAPIResponse} The API response providing the metadata.
 */
function getImagesIdMetas(req, res) {
    var iid = req.params.iid;

    return db.getMetaBasic(req.user, iid, function(err, meta) {
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
}

/**
 * @typedef AnnotationGetAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the user has permission to access the image and the retrieval succeeded.
 * @property {APIError} [err] - The error that caused the request to fail.
 * @property {ImageAnnotations} [anno] - All annotations we have stored for the image.
 */

/**
 * API endpoint to fetch annotations stored for an image.
 * @hbcsapi {GET} /images/:iid/annos - This is an API endpoint. 
 * @param {string} :iid - The image id to lookup.
 * @returns {AnnotationGetAPIResponse} The API response providing the annotations.
 */
function getImagesIdAnnos(req, res) {
    var iid = req.params.iid;

    db.checkImagePerm(req.user, iid, function(err, bool) {
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
}

/**
 * @typedef FieldGetAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the user has permission to access the image and the retrieval succeeded.
 * @property {APIError} [err] - The error that caused the request to fail.
 * @property {ImageFields} [meta] - The project specific metadata we have stored for the image.
 */

/**
 * API endpoint to fetch extended project specific metadata stored for an image.
 * @hbcsapi {GET} /images/:iid/fields - This is an API endpoint. 
 * @param {string} :iid - The image id to lookup.
 * @returns {FieldGetAPIResponse} The API response providing the project-specific metadata.
 */
function getImagesIdFields(req, res) {
    var iid = req.params.iid;

    db.checkImagePerm(req.user, iid, function(err, bool) {
        if (bool) {
            db.getImageFields(iid, function(err, fields) {
                if (err) {
                    res.send(new errors.APIErrResp(2, 'Failed to retrieve metadata.'));
                } else {
                    res.send({
                        'res': true,
                        'fields': fields
                    });
                }
            });
        } else {
            res.send(new errors.APIErrResp(1, 'You do not have permission to access this image.'));
        }
    });
}

/**
 * Registers Express routes related to metadata handling. These are API endpoints.
 * @static
 * @param {Express} app - The Express application object.
 */
function metaRoutes(app) {
    app.post('/meta', auth.enforceLoginCustom({'minPL':'user'}), postMeta);
    app.get('/images/:iid/metas', getImagesIdMetas);
    app.get('/images/:iid/annos', auth.enforceLogin, getImagesIdAnnos);
    app.get('/images/:iid/fields', auth.enforceLogin, getImagesIdFields);
}

// Export all public members.
module.exports = {
    metaRoutes: metaRoutes
};

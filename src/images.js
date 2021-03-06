/** 
 * @module images 
 */

var fs = require('fs');
var md5 = require('MD5');
var aws = require('aws-sdk');
var async = require('async');
var _ = require('underscore');
var errors = require('./error.js');
var express = require('express');
var archiver = require('archiver');
var lazystream = require('lazystream');
var Thumbnailer = require('./Thumbnailer.js');
var path = require('path');
var db = require('./db.js');
var auth = require('./auth/auth.js');
var util = require('./util.js');

aws.config.loadFromPath('./config/aws.json');

/**
 * Global S3 client object, with configuration pre-loaded.
 */
var s3 = new aws.S3();

/**
 * The S3 bucket name to use for private image storage.
 */
var PRIVATE_BUCKET = 'citizen.science.image.storage';
/**
 * The S3 bucket name to use for public image storage.
 * This bucket should be set to make all objects publically viewable, and the S3 web server should be enabled (recommended).
 */
var PUBLIC_BUCKET  = 'citizen.science.image.storage.public';

/**
 * The URL stem to use when serving public images. Must not require authentication!
 */
var S3_URL = 'http://' + PUBLIC_BUCKET + '.s3-website-eu-west-1.amazonaws.com/'; // S3 web server URL (preferred)
//var S3_URL = 'https://' + PUBLIC_BUCKET + '.s3.amazonaws.com/'; // Raw bucket URL - use if https is required or web server disabled.

/**
 * The prefix to add to an image to get it's thumbnail.
 */
var THUMB_PFIX = 'thm_';

/**
 * The suffix to add to an image to get it's thumbnail, including extension.
 */
var THUMB_SFIX = ''; // Keep this blank for now, as it will cause issues with S3 redirects.

/**
 * Number of seconds to keep a private image URL valid for.
 */
var PRIVATE_EXPIRY = 120;

/**
 * Defines the MIME types to accept as image uploads.
 */
var VALID_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/bmp'
    // 'image/tiff' // TIFF is not universally supported by major browsers
];

/**
 * The limits that will be enforced when validating uploads.
 * @type {ValidationRestrictions}
 */
var IMG_LIMITS = {
    'minDim': 250,
    'minPx': 250 * 250
};

/**
 * The dimensions to aim for when thumbnailing an image. These are an upper bound.
 * @type {Dimensions}
 */
var THUMB_DIM = {
    'w': 400,
    'h': 300
};

/**
 * The format (as a "magick" string) to use for thumbnails. See {@link http://www.graphicsmagick.org/formats.html}.
 */
var THUMB_FORMAT = 'JPEG';

/**
 * The MIME type that corresponds to the thumbnail format in {@link THUMB_FORMAT}.
 */
var THUMB_MIME = "image/jpeg";

/**
 * Whether thumbnails should be padded with a white border to the target size.
 */
var PAD_THUMBS = false;

/**
 * Instantiate an image thumbnailer and validator.
 */
var IMAGE_PROCESSOR = new Thumbnailer(IMG_LIMITS, THUMB_DIM, '/tmp', '/tmp', THUMB_FORMAT, THUMB_PFIX, THUMB_SFIX, PAD_THUMBS);

/**
 * @typedef Image
 * @type {object}
 * @property {string} imageid - The id of the image.
 * @property {boolean} private - Whether the image is private.
 */

/**
 * Gets an s3 object as a Node stream.
 * @param {Image} img - The image to stream.
 * @param {boolean} [thumb=false] - If true, fetch the thumbnail.
 * @returns {stream.Readable} A readable stream of the image data.
 */
function getImageStream(img, thumb) {
    // If thumb not provided, default to false.
    if (thumb !== true) {
        thumb = false;
    }
    var params = {
        'Bucket': (img.private) ? PRIVATE_BUCKET : PUBLIC_BUCKET,
        'Key': (thumb ? THUMB_PFIX : '') + img.imageid
    };
    var rs = null;
    var s3req = s3.getObject(params);

    s3req.on('error', function(err) {
        console.log('Error getting image stream: ' + JSON.stringify(params));
        console.log(err);
    });
    // TODO: This crashes if any error occurs (including not found!), despite listening for the event!
    rs = s3req.createReadStream();
    return rs;
}

/**
 * Proxies an image from S3 to a given writeable stream.
 * @param {string} imageid - The id of the image.
 * @param {boolean} priv - Whether the image is private.
 * @param {stream.Writeable} stream - The stream to pipe into (e.g. an express request or file stream).
 * @param {boolean} [thumb=false] - If true, proxy the thumbnail.
 */
function proxyImage(id, priv, stream, thumb) {
    // If thumb not provided, default to false.
    if (thumb !== true) {
        thumb = false;
    }
    try {
        getImageStream({'imageid': id, 'private': priv}, thumb).pipe(stream);
    } catch (err) {
        console.log(err);
        stream.end();
    }
}

/**
 * Image archive callback.
 * @callback imageArchiveCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {string} filename - The name of the zip file.
 */

// TODO: Collect images and notify user when done, instead of waiting.
/**
 * Downloads and archives a list of images into a zip. The user's id is used to create the filename, and only one job per user may be running at a time.
 * @param {number} uid - The id of the user to create the archive for.
 * @param {Image[]} images - The list of images to add to the zip.
 * @param {imageArchiveCallback} done - The callback that handles the output of the archive operation.
 */
function collectImages(uid, images, done) {
    var outfile = fs.createWriteStream('/tmp/' + uid + '.zip');
    var archive = archiver('zip');

    archive.on('error', function(err) {
        console.log(err);
        done(err);
    });

    outfile.on('close', function() {
        console.log('Zip for ' + uid + ' completed with size ' + archive.pointer());
        done(null, uid + '.zip');
    });

    // Feed the zip into the tmp file.
    archive.pipe(outfile);

    _.each(images, function(img) {
        console.log(img);
        var imgStream = new lazystream.Readable(getImageStream, img);
        archive.append(imgStream, { 'name': img.imageid });
    });

    archive.finalize();
}

/**
 * Gets the extension from a filename.
 * @param {string} filePath - The file's path.
 * @returns {string|null} The extension of the file, or null if not present.
 */
function fileType(filePath) {
    for (var i = filePath.length; i > 0; i--) {
        if (filePath[i] === '.') {
            return filePath.slice(i + 1, filePath.length);
        }
    }
    return null;
}

/**
 * Moves an object between buckets on S3.
 * @static
 * @param {string} srcBucket - The source bucket.
 * @param {string} destBucket - The destination bucket.
 * @param {string} key - The key of the file to move.
 * @param {errorCallback} callback - The callback that handles any errors that occurred when attempting the move.
 */
function moveObject(srcBucket, destBucket, key, callback) {
    var params = {
        'Bucket': destBucket,
        'CopySource': srcBucket + '/' + key,
        'Key': key
    };
    var dparams = {
        'Bucket': srcBucket,
        'Key': key
    };

    return s3.copyObject(params, function(err, data) {
        if (err) {
            console.log(err);
            return callback(err);
        } else {
            // The copy succeeded, we must delete the original.
            s3.deleteObject(dparams, function(dErr, dData) {
                if (dErr) {
                    console.log(dErr);
                    return callback(dErr);
                } else {
                    return callback();
                }
            });
        }
    });
}

/**
 * Sets the access level on the image by moving it to the corresponding bucket. Will silently fail if the image is not found in the opposite bucket.
 * @static
 * @param {string} id - The id of the image.
 * @param {boolean} priv - The access level to set the image to.
 * @param {errorCallback} callback - The callback that handles any unhandled errors when moving the image.
 */
function setAccess(id, priv, callback) {
    var src, dest;
    if (priv) {
        src = PUBLIC_BUCKET;
        dest = PRIVATE_BUCKET;
    } else {
        src = PRIVATE_BUCKET;
        dest = PUBLIC_BUCKET;
    }

    var moveCallback = function(err) {
        if (err) {
            if (err.code === 'NoSuchKey') {
                // If the error was key not found, ignore it, as that should mean the image is already in the destination.
                console.log('Ignoring NoSuchKey on setAccess.');
                return callback();
            } else {
                console.log(err);
                return callback(err);
            }
        } else {
            // No error, try to move the thumbnail.
            return moveObject(src, dest, THUMB_PFIX + id + THUMB_SFIX, function(err) {
                if (err) {
                    if (err.code === 'NoSuchKey') {
                        // If the error was key not found, ignore it, as that should mean the image is already in the destination.
                        console.log('Ignoring NoSuchKey on thumb setAccess.');
                        return callback();
                    } else {
                        console.log(err);
                        return callback(err);
                    }
                } else {
                    return callback();
                }
            });
        }
    };

    return moveObject(src, dest, id, moveCallback);
}

/**
 * @typedef ImageUpload
 * @type {object}
 * @property {string} felinaHash - The hash of the image to use as it's id.
 * @property {string} type - The MIME type of the image.
 * @property {Buffer} fileContents - The contents of the image file.
 */

/**
 * Uploads an image file to S3, and inserts it into the database using {@link addNewImage}.
 * @param {user.User} user - The user to associate the image with.
 * @param {ImageUpload} iInfo - The image to be uploaded.
 * @param {number} pid - The id of the project to associate the image with.
 * @param {errorCallback} callback - The callback detailing whether the upload was successful or not.
 */
function uploadImage(user, iInfo, pid, callback) {
    console.log('Trying to upload: ' + iInfo.felinaHash);
    var params = {
        'Bucket': PRIVATE_BUCKET,
        'Key': iInfo.felinaHash,
        'ContentType': iInfo.type,
        'Body': iInfo.fileContents
    };

    return s3.putObject(params, function(err, data) {
        if (err) {
            console.log(err);
            return callback(err);
        } else {
            // DB method will call our callback for us.
            return db.addNewImage(user, pid, iInfo.felinaHash, callback);
        }
    });
}


/**
 * Uploads a thumbnail to S3.
 * @param {string} thumb - The path to the thumbnail to upload.
 * @param {errorCallback} callback - The callback detailing whether the upload was successful or not.
 */
function uploadThumb(thumb, callback) {
    var thumbBuffer;
    try {
        thumbBuffer = fs.readFileSync(thumb);
    } catch (e) {
        console.log(e);
        return callback(e);
    }

    var params = {
        'Bucket': PRIVATE_BUCKET,
        'Key': path.basename(thumb),
        'ContentType': THUMB_MIME,
        'Body': thumbBuffer
    };

    return s3.putObject(params, function(err, data) {
        return callback(err);
    });
}

/***
 ** API ROUTE FUNCTIONS
 **/

/**
 * @typedef ImageListAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the list was retrieved, regardless of any images being present.
 * @property {Image[]} [images] - The list of images found.
 * @property {APIError} [err] - The error that caused the request to fail.
 */

/**
 * API endpoint to get a list of images belonging to a user, optionally filtered by uploader.
 * @hbcsapi {GET} images - This is an API endpoint.
 * @param {string} [uploader] - The email of the uploader to filter by.
 * @returns {ImageListAPIResponse} The API response supplying the list.
 */
function getImages(req, res) {
    db.getUserImages(req.user, req.query.uploader, function(err, result) {
        if (err) {
            res.send(new errors.APIErrResp(2, 'Could not load image list.'));
        } else {
            res.send({
                'res': true,
                'images': result
            });
        }
    });
}

/**
 * API endpoint to get a list of images belonging to a project.
 * @hbcsapi {GET} /projects/:pid/images - This is an API endpoint.
 * @param {number} :pid - The id of the project.
 * @param {number} [offset=0] - The index to begin listing images from.
 * @param {number} [limit=250] - The max number of images to return in the response.
 * @returns {ImageListAPIResponse} The API response supplying the list.
 */
function getProjectsIdImages(req, res) {
    var pid = parseInt(req.params.pid);
    var offset = parseInt(req.query.offset);
    var limit = parseInt(req.query.limit);

    if (_.isNaN(offset)) {
        offset = 0;
    }
    if (_.isNaN(limit)) {
        limit = 250;
    }

    if (_.isNaN(pid)) {
        return res.send(400, new errors.APIErrResp(2, 'Invalid project id.'));
    } else {
        return db.checkProjectAccess(req.user, pid, function(aErr, access) {
            if (aErr) {
                console.log(aErr);
                return res.send(new errors.APIErrResp(3, 'Failed to load project image list.'));
            } else if (access) {
                db.getImages(pid, offset, limit, function(err, result) {
                    if (err) {
                        res.send(new errors.APIErrResp(3, 'Failed to load project image list.'));
                    } else {
                        res.send({
                            'res': true,
                            'images': result
                        });
                    }
                });
            } else {
                return res.send(new errors.APIErrResp(4, 'Project not found.'));
            }
        });
    }
}

/**
 * API endpoint to delete an image.
 * @hbcsapi {DELETE} /images/:iid - This is an API endpoint.
 * @param {string} :iid - The image id to delete.
 * @returns {BasicAPIResponse} The API response indicating the outcome.
 */
function delImagesId(req, res) {
    var iid = req.params.iid;
    
    if (typeof iid !== 'string' || iid.length !== 32) {
        return res.send(new errors.APIErrResp(2, 'Invalid image id.'));
    }

    // Need to get the containing bucket and owner id
    return db.checkImagePerm(req.user, iid, function(err, allow, priv) {
        if (err) {
            return res.send(new errors.APIErrResp(3, 'Image not found.'));
        } else if (allow) {
            return db.deleteImage(iid, function(err2) {
                if (err2) {
                    return res.send(new errors.APIErrResp(4, 'Failed to delete image.'));
                } else {
                    var params = {
                        'Bucket': (priv ? PRIVATE_BUCKET : PUBLIC_BUCKET),
                        'Key': iid
                    };

                    return s3.deleteObject(params, function(aErr, data) {
                        if (aErr) {
                            console.log(aErr);
                            return res.send(new errors.APIErrResp(5, 'Failed to delete image.'));
                        } else {
                            return res.send({
                                'res': true
                            });
                        }
                    });
                }
            });
        } else {
            return res.send(new errors.APIErrResp(6, 'Insufficient permissions.'));
        }
    });
}

/**
 * API endpoint to get an image.
 * @hbcsapi {GET} /images/:iid - This is an API endpoint.
 * @param {string} :iid - The image id to get.
 * @param {boolean} [src=false] - If false, the thumbnail will be returned, if it is available.
 * @returns {Redirect} The request will be redirected to the image URL.
 */
function getImagesId(req, res) {
    var iid = req.params.iid;
    var src = req.query.src;

    return db.checkImagePerm(req.user, iid, function(err, allowed, priv) {
        if (!allowed) {
            // res.redirect('/static/padlock.png'); // Local copy of access denied image
            return res.redirect(S3_URL + 'padlock.png'); // S3 copy of image
        } if (priv === 1 || priv === true) {
            // proxyImage(iid, priv, res, !src); // Proxy image via the API server. (Much) slower but more secure.
            var params = {
                'Bucket': PRIVATE_BUCKET,
                'Key': (src ? '' : THUMB_PFIX) + iid,
                'Expires': PRIVATE_EXPIRY
            };
            // Use a signed URL to serve directly from S3. Note that anyone with the URL can access the image until it expires!
            return res.redirect(s3.getSignedUrl('getObject', params));
        } else if (priv === 0 || priv === false) {
            // Image is public, redirect to the public URL. Add the prefix if we don't want the source image.
            return res.redirect(S3_URL + (src ? '' : THUMB_PFIX)  + iid);
        } else {
            // res.redirect('/static/padlock.png'); // Local copy of access denied image
            return res.redirect(S3_URL + 'padlock.png'); // S3 copy of image
        }
    });
}

/**
 * @typedef ImageUploadAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the operation succeeded.
 * @property {APIError} [err] - The error that caused the request to fail.
 * @property {string[]} [ids] - A list of all the ids generated for each of the uploaded images. The list will be ordered according to their order in the request body.
 */

/**
 * API endpoint to upload an image. This endpoint is irregular in that it accepts multipart form-encoded data, instead of JSON.
 * @todo Need to refactor temp file cleanup so that it happens on all outcomes.
 * @hbcsapi {POST} /images - This is an API endpoint.
 * @param {string} url - The URL to grab a remote image from. Ignored if an image file is found in the body.
 * @param {form-data} image - The body of the file to upload.
 * @param {number} project - The id of the project to associate the image with.
 * @returns {ImageUploadAPIResponse} The API response providing the ids assigned to the images, if successful.
 */
function postImages(req, res) {
    var iInfo = req.files ? req.files.image : null;

    if (!iInfo) {
        // No image file has been sent to us, look for a URL instead.
        var url = req.body.url;
        var fn = require('os').tmpDir() + '/' + util.getRandomHash();
        var file = fs.createWriteStream(fn);
        // TODO: Do this better.
        return require('http').get(url, function(response) {
            console.log('Piping to ' + fn);
            var pipey = response.pipe(file);
            return pipey.on('finish', function() {
                console.log('THE END');
                iInfo = {
                    "path": fn,
                    "name": "urlimage",
                    "type": "image/jpeg"
                };
                req.files =  {image:iInfo};
                return postImages(req,res);
            });
        });
    }

    // The body must contain a corresponding value that gives the project id.
    // var project;
    var project = parseInt(req.body.project);
    // if (req.user.isSubuser()) {
    //     project = req.user.projectid;
    // } else {
    //     project = parseInt(req.body.project);
    // }
    if (_.isNaN(project)) {
        res.send(400, new errors.APIErrResp(2, 'Invalid project provided.'));
        // Simply delete invalid image.
        return fs.unlinkSync(iInfo.path);
    }

    // If any file has an unwanted type, abort the request.
    if (VALID_MIME_TYPES.indexOf(iInfo.type) < 0) {
        // Invalid mime type, reject request.
        res.send(400, new errors.APIErrResp(3, 'Invalid file or type.'));
        // Simply delete invalid image.
        return fs.unlinkSync(iInfo.path);
    }

    // Validate the file first
    return IMAGE_PROCESSOR.verify(path.basename(iInfo.path), function(okay) {
        if (okay) {
            // TODO: Can we avoid loading everything into memory?
            iInfo.fileContents = fs.readFileSync(iInfo.path);
            var elementsToHash = "";
            for (var j = 0; j < iInfo.fileContents.length; j += iInfo.fileContents.length / 100) {
                elementsToHash += iInfo.fileContents[Math.floor(j)];
            }
            iInfo.felinaHash = md5(elementsToHash);
            
            return db.imageExists(iInfo.felinaHash, function(iErr, exists) {
                if (exists === 0) {
                    // New image, upload!
                    console.log('Uploading new image.');
                    return uploadImage(req.user, iInfo, project, function(err) {
                        if (err) {
                            if (err.code === 'ER_NO_REFERENCED_ROW_') {
                                // We haven't met an FK constraint, this should be down to a bad project id.
                                res.send(400, new errors.APIErrResp(4, 'Invalid project.'));
                            } else {
                                console.log(err);
                                res.send(500, new errors.APIErrResp(0, 'Failed to upload image.'));
                            }
                        } else {
                            // All images should have uploaded succesfully.
                            res.send({
                                'res': true,
                                'id': iInfo.felinaHash
                            });
                        }
                        // Cleanup all temporary files used by upload, and generate thumbnails. Do this after we've responded.
                        _.each(req.files, function(info, fKey) {
                            if (fKey === 'image') {
                                // This is the actual uploaded image.
                                if (!info.felinaHash) {
                                    // Simply delete invalid image.
                                    return fs.unlinkSync(info.path);
                                }
                                // Try to thumbnail the image.
                                return IMAGE_PROCESSOR.make(info.felinaHash, path.basename(info.path), function(err, thm) {
                                    // Delete the source image regardless of outcome.
                                    return fs.unlink(info.path, function(sdErr) {
                                        if (err) {
                                            // If the thumbnail operation failed, quit now.
                                            console.log(err);
                                            return;
                                        }
                                        if (sdErr) {
                                            // Source deletion failed, but we do have a thumb to upload.
                                            console.log(sdErr);
                                        }
                                        
                                        console.log('Storing thumbnail: ' + thm);
                                        return uploadThumb(thm, function(upErr) {
                                            if (upErr) {
                                                console.log(upErr);
                                            }
                                            // Regardless of error we should delete the thumbnail.
                                            return fs.unlinkSync(thm);
                                        });
                                    });
                                });
                            } else {
                                // This is an unwanted file upload. Delete it.
                                return fs.unlink(info.path, function(e) {
                                    console.log(e);
                                });
                            }
                        });
                    });
                } else {
                    // Existing image, reject the request.
                    console.log('Rejecting duplicate image: ' + iInfo.felinaHash);
                    return res.send(409, new errors.APIErrResp(4, 'Image already exists.'));
                }
            });
        } else {
            // Upload was not a valid image file!
            console.log('Refused image upload after validation.');
            return res.send(400, new errors.APIErrResp(3, 'Invalid file or type.'));
        }
    });
} // End single image upload endpoint.

/**
 * API endpoint to export all of a user's images as a zip.
 * @hbcsapi {GET} /export - This is an API endpoint.
 * @returns {File|APIErrResp} The resulting file to be downloaded, or a JSON encoded API error response.
 */
function getExport(req, res) {
    db.getUserImages(req.user, null, function(err, images) {
        if (err) {
            return res.send(new errors.APIErrResp(2, 'Failed to gather image listing.'));
        } else {
            return collectImages(req.user.id, images, function(e, file) {
                if (e) {
                    return res.send(new errors.APIErrResp(3, 'Failed to collect images for download.'));
                } else {
                    return res.sendfile(file, {'root':'/tmp/'});
                }
            });
        }
    });
}

/**
 * Registers Express routes related to image handling. These are API endpoints.
 * @class
 * @static
 * @param {Express} app - The Express application object.
 */
function imageRoutes(app) {
    app.get('/images', auth.enforceLogin, getImages);
    app.del('/images/:iid', auth.enforceLogin, delImagesId);
    app.get('/images/:iid', getImagesId);
    app.post('/images', [auth.enforceLogin, express.multipart()], postImages);
    app.get('/export', auth.enforceLoginCustom({'minPL':'researcher'}), getExport);
    app.get('/projects/:pid/images', auth.enforceLoginCustom({'minPL':'researcher'}), getProjectsIdImages);
}

// Export public members.
module.exports = {
    setAccess: setAccess,
    imageRoutes: imageRoutes
};

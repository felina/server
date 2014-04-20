/** 
 * @module images 
 */

var fs = require('fs');
var md5 = require('MD5');
var aws = require('aws-sdk');
var async = require('async');
var _ = require('underscore');
var errors = require('./error.js');
var users = require('./user.js');
var express = require('express');
var archiver = require('archiver');
var lazystream = require('lazystream');
var Thumbnailer = require('./thumbnailer.js');
var path = require('path');

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
    'minDim': 400,
    'minPx': 512 * 512
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
 * Sets the access level on the image by moving it to the corresponding bucket. Will silently fail if the image is not found in the opposite bucket.
 * @static
 * @param {string} id - The id of the image.
 * @param {boolean} priv - The access level to set the image to.
 * @param {errorCallback} callback - The callback that handles any unhandled erros when moving the image.
 */
function setAccess(id, priv, callback) {
    var params, dparams;
    if (priv) {
        // Currently public, make private.
        params = {
            'Bucket': PRIVATE_BUCKET,
            'CopySource': PUBLIC_BUCKET + '/' + id,
            'Key': id
        };
        dparams = {
            'Bucket': PUBLIC_BUCKET,
            'Key': id
        };
    } else {
        params = {
            'Bucket': PUBLIC_BUCKET,
            'CopySource': PRIVATE_BUCKET + '/' + id,
            'Key': id
        };
        dparams = {
            'Bucket': PRIVATE_BUCKET,
            'Key': id
        };
    }

    s3.copyObject(params, function(err, data) {
        if (err) {
            if (err.code === 'NoSuchKey') {
                // The item must already be at the given bucket, unless our db is out of sync!
                console.log('Ignoring NoSuchKey on setAccess.');
                return callback(null);
            } else {
                console.log(err);
                return callback(err);
            }
        } else {
            // The copy succeeded, we must delete the original.
            s3.deleteObject(dparams, function(dErr, dData) {
                if (dErr) {
                    console.log(dErr);
                    return callback(dErr);
                } else {
                    return callback(null);
                }
            });
        }
    });
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
 * @param {object} db - The db object.
 * @param {errorCallback} callback - The callback detailing whether the upload was successful or not.
 */
function uploadImage(user, iInfo, pid, db, callback) {
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
            return db.addNewImage(user, pid, iInfo.felinaHash, function(dbErr, id) {
                if (dbErr) {
                    console.log(dbErr);
                    return callback(dbErr);
                } else {
                    return callback(null, id);
                }
            });
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

/**
 * Registers Express routes related to image handling. These are API endpoints.
 * @static
 * @param {Express} app - The Express application object.
 * @param {object} auth - The auth module.
 * @param {object} db - The db module.
 */
function imageRoutes(app, auth, db) {
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
    app.get('/images', auth.enforceLogin, function(req, res) {
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
    });

    /**
     * @typedef BasicAPIResponse
     * @type {object}
     * @property {boolean} res - True iff the operation succeeded.
     * @property {APIError} [err] - The error that caused the request to fail.
     */

    /**
     * API endpoint to delete an image.
     * @hbcsapi {DELETE} img - This is an API endpoint.
     * @param {string} id - The image id to delete.
     * @returns {BasicAPIResponse} The API response indicating the outcome.
     */
    app.del('/img', function(req, res) {
        var id = req.query.id;
        
        if (typeof id !== 'string' || id.length !== 32) {
            return res.send(new errors.APIErrResp(2, 'Invalid image id.'));
        }

        // Need to get the containing bucket and owner id
        return db.getImageOwner(id, function(err, info) {
            if (err) {
                return res.send(new errors.APIErrResp(3, 'Image not found.'));
            } else if (req.user.isAdmin || info.ownerid === req.user.id) {
                return db.deleteImage(id, function(err2) {
                    if (err2) {
                        return res.send(new errors.APIErrResp(4, 'Failed to delete image.'));
                    } else {
                        var params = {
                            'Bucket': (info.private ? PRIVATE_BUCKET : PUBLIC_BUCKET),
                            'Key': id
                        };

                        return s3.deleteObject(params, function(aErr, data) {
                            if (aErr) {
                                console.log(aErr);
                                return res.send(new errors.APIErrResp(5, 'Failed to delete image.'));
                            }
                            return res.send({
                                'res': true
                            });
                        });
                    }
                });
            } else {
                return res.send(new errors.APIErrResp(1, 'Insufficient permissions.'));
            }
        });
    });

    // Deprecated
    app.get('/img/:id', function(req, res) {
        res.redirect('/img?id=' + req.params.id);
    });

    /**
     * API endpoint to get an image.
     * @hbcsapi {GET} img - This is an API endpoint.
     * @param {string} id - The image id to get.
     * @param {boolean} [src=false] - If false, the thumbnail will be returned, if it is available.
     * @returns {Redirect} The request will be redirected to the image URL.
     */
    app.get('/img', function(req, res) {
        var uid = req.user ? req.user.id : -1;
        var src = req.query.src;
        db.checkImagePerm(uid, req.query.id, function(err, priv) {
            if (priv === 1 || priv === true) {
                // proxyImage(req.query.id, priv, res, !src); // Proxy image via the API server. (Much) slower but more secure.
                // TODO: Support thumbnails for private images
                var params = {
                    'Bucket': PRIVATE_BUCKET,
                    'Key': (src ? '' : THUMB_PFIX) + req.query.id,
                    'Expires': PRIVATE_EXPIRY
                };
                // Use a signed URL to serve directly from S3. Note that anyone with the URL can access the image until it expires!
                res.redirect(s3.getSignedUrl('getObject', params));
            } else if (priv === 0 || priv === false) {
                // Image is public, redirect to the public URL. Add the prefix if we don't want the source image.
                res.redirect(S3_URL + (src ? '' : THUMB_PFIX)  + req.query.id);
            } else {
                // res.redirect('/Padlock.png'); // Local copy of access denied image
                res.redirect(S3_URL + 'padlock.png'); // S3 copy of image
            }
        });
    });


    /**
     * @typedef ImageUploadAPIResponse
     * @type {object}
     * @property {boolean} res - True iff the operation succeeded.
     * @property {APIError} [err] - The error that caused the request to fail.
     * @property {string[]} [ids] - A list of all the ids generated for each of the uploaded images. The list will be ordered according to their order in the request body.
     */

    /**
     * API endpoint to upload an image. This endpoint is irregular in that it accepts multipart form-encoded data, instead of JSON.
     * @hbcsapi {POST} img - This is an API endpoint.
     * @param {form-data} file - The body of the file to upload. In case of multiple file uploads, this can be any unique string.
     * @param {number} file_project - The id of the project to associate 'file' with. In the case of multiple files, this parameter should match the file parameter, with the suffix '_project'.
     * @returns {ImageUploadAPIResponse} The API response providing the ids assigned to the images, if successful.
     */
    app.post('/img', [auth.enforceLogin, express.multipart()], function(req, res) {
        // Don't return here, temp file cleanup at end!
        async.map(
            Object.keys(req.files),
            function(fKey, done) {
                var iInfo = req.files[fKey];
                
                // The body must contain a corresponding value that gives the project id.                 
                var project = false;
                if(req.user.privilege === users.PrivilegeLevel.SUBUSER.i){
                    project = req.user.projectid;
                } else {
                    project = parseInt(req.body[fKey + '_project']);
                }
                if (_.isNaN(project)) {
                    return done('Must supply a valid project id for each image.');
                }
                // Attempt to hash the file. If any file has an unwanted type, abort the request.
                if (VALID_MIME_TYPES.indexOf(iInfo.type) < 0) {
                    // Invalid mime type, reject request.
                    return done('Invalid file type: ' + iInfo.type + " name: " + iInfo.name);
                }

                // Validate the file first
                console.log(path.basename(iInfo.path));
                return IMAGE_PROCESSOR.verify(path.basename(iInfo.path), function(okay) {
                    if (okay) {
                        // TODO: Can we avoid loading everything into memory?
                        iInfo.fileContents = fs.readFileSync(iInfo.path); // semi sketchy decoding
                        console.log('LENGTHS:' + iInfo.fileContents.length + ' - ' + iInfo.size);
                        var elementsToHash = "";
                        for (var j = 0; j < iInfo.fileContents.length; j += iInfo.fileContents.length / 100) {
                            elementsToHash += iInfo.fileContents[Math.floor(j)];
                        }
                        iInfo.felinaHash = md5(elementsToHash);

                        return db.imageExists(iInfo.felinaHash, function(iErr, exists) {
                            if (exists === 0) {
                                // New image, upload!
                                console.log('Uploading new image.');
                                return uploadImage(req.user, iInfo, project, db, done); // Will call done() for us
                            } else {
                                // Existing image, reject the request.
                                return done('Image already exists: ' + iInfo.name);
                            }
                        });
                    } else {
                        // Upload was not a valid image file!
                        console.log('Refused image upload after validation.');
                        return done('File was not a valid image.');
                    }
                });
            },
            function(err, idArr) {
                console.log('End block');
                // If anything errored, abort.
                if (err) {
                    // TODO: be more clear if any images were uploaded or not.
                    if (err.code === 'ER_NO_REFERENCED_ROW_') {
                        // We haven't met an FK constraint, this should be down to a bad project id.
                        res.send(new errors.APIErrResp(3, 'Invalid project.'), 400);
                    } else {
                        console.log(err);
                        res.send(new errors.APIErrResp(2, err), 400);
                    }
                } else {
                    // All images should have uploaded succesfully.
                    res.send({
                        'res': true,
                        'ids': idArr
                    });
                }

                // Cleanup all temporary files used by upload, and generate thumbnails. Do this after we've responded.
                async.each(Object.keys(req.files),
                           function(fKey, done) {
                               var info = req.files[fKey];
                               if (!info.felinaHash) {
                                   // Not a valid image, but still needs unlink'ing.
                                   console.log('Deleting invalid: ' + info.path);
                                   return fs.unlink(info.path, done);
                               }
                               console.log('Thumbnailing: ' + info.path);
                               return IMAGE_PROCESSOR.make(info.felinaHash, path.basename(info.path), function(err, thm) {
                                   // Delete the source image regardless of outcome.
                                   console.log('Deleting: ' + info.path);
                                   return fs.unlink(info.path, function(sdErr) {
                                       if (err) {
                                           // If the thumbnail operation failed, quit now.
                                           return done(err);
                                       }
                                       if (sdErr) {
                                           console.log(sdErr);
                                       }

                                       console.log('Storing thumbnail: ' + thm);
                                       return uploadThumb(thm, function(upErr) {
                                           if (upErr) {
                                               // Regardless of error we should delete the thumbnail, else they might build up.
                                               console.log(upErr);
                                           }
                                           console.log('Deleting: ' + thm);
                                           return fs.unlink(thm, done);
                                       });
                                   });
                               });
                           },
                           function(e) {
                               if (e) {
                                   console.log(e);
                               }
                           });
            });
    }); // End image upload endpoint.

    /**
     * API endpoint to export all of a user's images as a zip.
     * @hbcsapi {GET} export - This is an API endpoint.
     * @returns {File|APIErrResp} The resulting file to be downloaded, or a JSON encoded API error response.
     */
    app.get('/export', auth.enforceLoginCustom({'minPL':'researcher'}), function(req, res) {
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
    });

}

// Export public members.
module.exports = {
    setAccess: setAccess,
    imageRoutes: imageRoutes
};

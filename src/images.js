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
 * @typedef Image
 * @type {object}
 * @property {string} imageid - The id of the image.
 * @property {boolean} private - Whether the image is private.
 */

/**
 * Gets an s3 object as a Node stream.
 * @param {Image} img - The image to stream.
 * @returns {stream.Readable} A readable stream of the image data.
 */
function getImageStream(img) {
    var params = {
        'Bucket': (img.private) ? PRIVATE_BUCKET : PUBLIC_BUCKET,
        'Key': img.imageid
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
 */
function proxyImage(id, priv, stream) {
    try {
        getImageStream({'imageid': id, 'private': priv}).pipe(stream);
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
    app.get('/images', auth.enforceLogin, function imagesEndpoint(db, req, res) {
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
     * @returns {Redirect} The request will be redirected to the image URL.
     */
    app.get('/img', function(req, res) {
        var uid = req.user ? req.user.id : -1;
        db.checkImagePerm(uid, req.query.id, function(err, priv) {
            if (priv === 1 || priv === true) {
                // proxyImage(req.query.id, priv, res); // Proxy image via the API server. (Much) slower but more secure.
                var params = {
                    'Bucket': PRIVATE_BUCKET,
                    'Key': req.query.id,
                    'Expires': PRIVATE_EXPIRY
                };
                // Use a signed URL to serve directly from S3. Note that anyone with the URL can access the image until it expires!
                res.redirect(s3.getSignedUrl('getObject', params));
            } else if (priv === 0 || priv === false) {
                // Image is public, redirect to the public URL.
                res.redirect(S3_URL + req.query.id);
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
        async.map(Object.keys(req.files),
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
                              return uploadImage(req.user, iInfo, project, db, done); // Will call done() for us
                          } else {
                              // Existing image, reject the request.
                              return done('Image already exists: ' + iInfo.name);
                          }
                      });
                  },
                  function(err, idArr) {
                      // If anything errored, abort.
                      if (err) {
                          // TODO: be more clear if any images were uploaded or not.
                          if (err.code === 'ER_NO_REFERENCED_ROW_') {
                              // We haven't met an FK constraint, this should be down to a bad project id.
                              return res.send(new errors.APIErrResp(3, 'Invalid project.'), 400);
                          } else {
                              console.log(err);
                              return res.send(new errors.APIErrResp(2, err), 400);
                          }
                      } else {
                          // All images should have uploaded succesfully.
                          return res.send({
                              'res': true,
                              'ids': idArr
                          });
                      }
                  });

        // Cleanup all temporary files used by upload.
        async.each(Object.keys(req.files),
                   function(fKey, done) {
                       console.log('Deleting: ' + req.files[fKey].path);
                       fs.unlink(req.files[fKey].path, done);
                   },
                   function(e) {
                       if (e) {
                           console.log(e);
                       }
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

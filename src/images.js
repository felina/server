var fs = require('fs');
var md5 = require('MD5');
var aws = require('aws-sdk');
var async = require('async');
var _ = require('underscore');
var errors = require('./error.js');

aws.config.loadFromPath('./config/aws.json');
var s3 = new aws.S3();

var PRIVATE_BUCKET = 'citizen.science.image.storage';
var PUBLIC_BUCKET  = 'citizen.science.image.storage.public';

//var S3_URL = 'https://' + PUBLIC_BUCKET + '.s3.amazonaws.com/'; // Raw bucket URL
var S3_URL = 'http://' + PUBLIC_BUCKET + '.s3-website-eu-west-1.amazonaws.com/'; // S3 web server URL (preferred)

var PRIVATE_EXPIRY = 120; // Number of seconds to keep a private image URL valid for

// Defines the MIME types we accept as image uploads.
var VALID_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/bmp',
    'image/tiff'
];

function fileType(filePath) {
    for (var i = filePath.length; i > 0; i--) {
        if (filePath[i] === '.') {
            return filePath.slice(i + 1, filePath.length);
        }
    }
    return null;
}

function proxyImage(id, priv, res) {
    var params = {
        'Bucket': (priv) ? PRIVATE_BUCKET : PUBLIC_BUCKET,
        'Key': id
    };
    s3.getObject(params).createReadStream().pipe(res);
}

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
            return db.addNewImage(user, pid, iInfo.felinaHash, function(dbErr) {
                if (dbErr) {
                    console.log(dbErr);
                    return callback(dbErr);
                } else {
                    return callback(null);
                }
            });
        }
    });
}

function imageRoutes(app, auth, db) {
    // Endpoint to get list of images
    app.get('/images', auth.enforceLogin, function(req, res) {
        db.getUserImages(req.user, function(err, result) {
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

    // Deprecated
    app.get('/img/:id', function(req, res) {
        res.redirect('/img?id=' + req.params.id);
    });

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

    // Image/s upload endpoint
    // Uses express.multipart - this is deprecated and bad! TODO: Replace me!
    app.post('/img', auth.enforceLogin, function(req, res) {
        async.each(Object.keys(req.files),
                   function(fKey, done) {
                       var iInfo = req.files[fKey];

                       // The body must contain a corresponding value that gives the project id.
                       var project = parseInt(req.body[fKey + '_project']);
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
                   function(err) {
                       // If anything errored, abort.
                       if (err) {
                           // TODO: be more clear if any images were uploaded or not.
                           if (err.code === 'ER_NO_REFERENCED_ROW_') {
                               // We haven't met an FK constraint, this should be down to a bad project id.
                               return res.send(new errors.APIErrResp(3, 'Invalid project.'));
                           } else {
                               console.log(err);
                               return res.send(new errors.APIErrResp(2, err));
                           }
                       } else {
                           // All images should have uploaded succesfully.
                           return res.send({
                               'res': true,
                               'uploaded': Object.keys(req.files).length
                           });
                       }
                   });
    }); // End image upload endpoint.
}

module.exports = {
    setAccess: setAccess,
    imageRoutes: imageRoutes
};

var fs = require('fs');
var md5 = require('MD5');
var aws = require('aws-sdk');
var errors = require('./error.js');
//
aws.config.loadFromPath('./config/aws.json');
var s3 = new aws.S3();

var PRIVATE_BUCKET = 'citizen.science.image.storage';
var PUBLIC_BUCKET  = 'citizen.science.image.storage.public';

function fileType(filePath) {
    for (var i = filePath.length; i > 0; i--) {
        if (filePath[i] === '.') {
            return filePath.slice(i + 1, filePath.length);
        }
    }
    return null;
}

function proxyImage(id, res) {
    var params = {
        'Bucket': 'citizen.science.image.storage',
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
        db.checkImagePerm(uid, req.query.id, function(err, bool) {
            if (bool) {
                proxyImage(req.query.id, res);
            } else {
                res.redirect('/Padlock.png');
            }
        });
    });

    // Image/s upload endpoint
    // Uses express.multipart - this is deprecated and bad! TODO: Replace me!
    app.post('/upload/img', auth.enforceLogin, function(req, res) {
        var resultObject = {};
        resultObject.status = {};

        var idData = req.files;
        var images = [];
        for (var imageName in idData) {
            images.push(idData[imageName]);
        }
        if (images.length > 0) {
            // resultObject.status.code = 0;
            resultObject.status.code = 0;
            resultObject.status.message = images.length.toString().concat(" images uploaded successfully");
            resultObject.ids = [];
            for (var i = 0; i < images.length; i++) {
                var imageFilePath = images[i].path;
                var fileContents = fs.readFileSync(imageFilePath); // semi sketchy decoding
                var elementsToHash = "";
                for (var j = 0; j < fileContents.length; j += fileContents.length / 100) {
                    elementsToHash += fileContents[Math.floor(j)];
                }
                // console.log(elementsToHash);
                var imageHash = md5(elementsToHash);
                resultObject.ids.push(imageHash);
                // if element hash not in database then upload to s3
                var imageObject = {
                    "imageData": fileContents,
                    "imageType": fileType(imageFilePath),
                    "imageHash": imageHash
                };
                uploadImage(req.user, imageObject);
            }
        } else {
            resultObject.status.code = 1;
            resultObject.status.message = "No images uploaded";
        }
        return res.send(resultObject);
    });

    function uploadImage(user, imageObject) {
        var params = {};
        params.Bucket = 'citizen.science.image.storage';
        params.Body = imageObject.imageData;
        params.Key = imageObject.imageHash;

        s3.putObject(params, function(err, data) {
            if (err) {
                console.log("uploadImage error: " + err);
            } else {
                db.addNewImage(user, {
                    'id': 1,
                    'name': 'dummy'
                }, imageObject);
            }
            console.log(data);
        });
    }
}

module.exports = {
    setAccess: setAccess,
    imageRoutes: imageRoutes
};

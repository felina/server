var fs = require('fs');
var _ = require('underscore');
var aws = require('aws-sdk');
var errors = require('./error.js');
var crypto = require('crypto');
var async = require('async');
var express = require('express');
var jsapi = require('./windows_api/api.js');

aws.config.loadFromPath('./config/aws.json');
var s3 = new aws.S3();

var PRIVATE_BUCKET = 'citizen.science.executable.storage';

function uploadZip(user, iInfo, db, callback) {
    console.log('Trying to upload: ' + iInfo.zipHash);
    var params = {
        'Bucket': PRIVATE_BUCKET,
        'Key': iInfo.zipHash,
        'ContentType': iInfo.type,
        'Body': iInfo.fileContents
    };

    return s3.putObject(params, function(err, data) {
        if (err) {
            console.log(err);
            return callback(err);
        } else {
            return db.addNewZip(user, iInfo.zipHash, iInfo.name, iInfo.filename, function(dbErr, id) {
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

function jobRoutes(app, auth, db) {
    // Job start req
    app.post('/start', auth.enforceLogin, function(req, res) {
        // Get the image IDs for processing
        var idData = req.files;
        var images = [];
        for (var imageName in idData) {
            images.push(idData[imageName]);
        }
        if (images.length > 0) {
            return res.send('Some image IDs received');
        } else {
            return res.send('Need to specify images for job');
        }

        /*if (req.files) {
          console.log('File exists');
          // console.log(req.files);
          console.log('Num files: ' + Object.keys(req.files).length)

      } else {
          console.log('File does not exist');
      }
      return res.send("Some image thing recieved\n");*/
    });

    // Job progress check
    app.get('/progress', auth.enforceLogin, function(req, res) {
        var jobID = parseInt(req.query.jobID);

        if (_.isNaN(jobID)) {
            return res.send(new errors.APIErrResp(2, 'Invalid job ID.'));
        } else {
            jsapi.getProgress(jobID, function(err, prog) {
                if (err) {
                    return res.send(new errors.APIErrResp(3, 'Failed to retrieve job progress.'));
                } else {
                    return res.send({
                        'res': true,
                        'progress': prog
                    });
                }
            });
        }
    });

    // Job results
    app.get('/results', auth.enforceLogin, function(req, res) {
        var jobID = parseInt(req.query.jobID);

        if (_.isNaN(jobID)) {
            return res.send(new errors.APIErrResp(2, 'Invalid job ID.'));
        } else {
            jsapi.getResults(jobID, function(err, results) {
                if (err) {
                    return res.send(new errors.APIErrResp(3, 'Failed to retrieve job progress.'));
                } else {
                    return res.send({
                        'res': true,
                        'results': results
                    });
                }
            });
        }
    });

    // Get all the jobs started by the researcher with the given id
    // TODO: actually get ID, read from database, etc.
    app.get('/jobs', auth.enforceLogin, function(req, res) {
        res.send({
            'res': true,
            'jobs': [
                {
                    name: 'Process some penguins',
                    eta: '37m',
                    current: 10,
                    total: 37,
                    image: '/img/elephant.jpg'
                },
                {
                    name: 'Analyse some elephants',
                    eta: '2h 15m',
                    current: 82,
                    total: 96,
                    image: '/img/elephant.jpg'
                }
            ]
        });
    });

    app.post('/exec', [auth.enforceLogin, express.multipart()], function(req, res) {
        async.map(Object.keys(req.files), function(fKey, done) {
            // console.log(req.files);
            var iInfo = req.files[fKey];
            iInfo['filename'] = fKey;
            var fd = fs.createReadStream(iInfo.path);
            // console.log(iInfo.path);

            var hash = crypto.createHash('md5');
            hash.setEncoding('hex');
            fd.on('end', function() {
                // console.log(done);

                hash.end();
                // console.log(hash.read()); // the desired sha1sum
                iInfo.zipHash = hash.read();
                // console.log(iInfo.zipHash);
                iInfo.name = req.body['name'];
                iInfo.fileContents = fs.readFileSync(iInfo.path);

                return db.zipExists(iInfo.zipHash, function(iErr, exists) {
                    if (exists === 0) {
                        // New image, upload!
                        return uploadZip(req.user, iInfo, db, done); // Will call done() for us
                    } else {
                        // Existing image, reject the request.
                        console.trace(done);
                        if (done) {
                           return done('Zip already exists: ' + iInfo.name);
                        }
                    }
                });
            });
            // read all file and pipe it (write it) to the hash object
            fd.pipe(hash);
        }, 
        function(err, idArr) {
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
                  'ids': idArr
              });
          }
      }
        );  
    });
}

module.exports = {
    jobRoutes: jobRoutes
};

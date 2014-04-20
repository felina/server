/**
 * @module jobs
 */

var fs = require('fs');
var _ = require('underscore');
var aws = require('aws-sdk');
var errors = require('./error.js');
var crypto = require('crypto');
var async = require('async');
var express = require('express');
var jsapi = require('./windows_api/api.js');

// Load the AWS configuration file.
aws.config.loadFromPath('./config/aws.json');

/**
 * Global S3 client object, with configuration pre-loaded.
 */
var s3 = new aws.S3();

/**
 * The S3 bucket name to use for executable storage.
 */
var PRIVATE_BUCKET = 'citizen.science.executable.storage';

/**
 * @typedef ZipUpload
 * @type {object}
 * @property {string} name - The display name of the zip. Will be tested for uniqueness.
 * @property {string} filename - The filename of the zip, as uploaded.
 * @property {Buffer} fileContents - The contents of the archive file.
 */

/**
 * Uploads a zip file to S3 and insert it into the database using {@link addNewZip}.
 * @param {user.User} user - The user to associate the zip withh.
 * @param {ZipUpload} zInfo - The archive to be uploaded.
 * @param {object} db - The db object.
 * @param {errorCallback} callback - The callback detailing whether upload was successful.
 */
function uploadZip(user, zInfo, db, callback) {
    console.log('Trying to upload: ' + zInfo.name);

    return db.tcAddNewZip(user, zInfo.name, zInfo.originalFilename, function(dbErr, id, accept) {
        if (dbErr) {
            // In case of a DB error, we don't need to notify the accept callback.
            console.log(dbErr);
            return callback(dbErr);
        } else {
            // The insertion succeeded, we now have an id and can put the object.
            var params = {
                'Bucket': PRIVATE_BUCKET,
                'Key': id + '.zip',
                'ContentType': 'application/zip',
                'Body': zInfo.fileContents
            };
            return s3.putObject(params, function(err, data) {
                if (err) {
                    // Uploading the object failed, so tell DB to deny the insertion.
                    console.log(err);
                    accept(false);
                    return callback(err);
                } else {
                    // Upload was a success, tell the DB to accept the insertion.
                    accept(true);
                    return callback(null, id);
                }
            });
        }
    });
}

/**
 * Registers Express routes related to job handling. These are API endpoints.
 * @static
 * @param {Express} app - The Express application object.
 * @param {object} auth - The auth module.
 * @param {object} db - The db module.
 */
function jobRoutes(app, auth, db) {
    // TODO: This method needs to be re-written. (placeholder)
    app.post('/start', auth.enforceLogin, function(req, res) {
        // Get the image IDs for processing
        var executable = req.body.executable;
        var images = req.body.images;

        if (images && executable && images.length > 0 && executable.length > 0) {
            return res.send({'res': true, 'code': 0, 'images': images, 'executable': executable});
        } else {
            return res.send({'res':false, 'code': 2, // Do proper code checks
                'msg': 'Need to specify images and executable for a job'});
        }
    });

    /**
     * API endpoint to get the current progress or state of a job.
     * @hbcsapi {GET} progress - This is an API endpoint.
     * @param {number} jobID - The id of the job to lookup.
     * @returns {number} progress - The percentage completion.
     */
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

    /**
     * @typedef ResultsAPIResponse
     * @type {object}
     * @property {boolean} res - True iff the results were retrieved from the job server.
     * @property {APIError} [err] - The error that caused the request to fail.
     * @property {object} The results of the job. The formatting will be job dependent.
     */

    /**
     * API endpoint to get the results of a job.
     * @hbcsapi {GET} results - This is an API endpoint.
     * @param {number} jobID - The id of the job to lookup.
     * @returns {ResultsAPIResponse} The response that provides the results of the job.
     */
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

    /**
     * @typedef ExecutableListAPIResponse
     * @type {object}
     * @property {boolean} res - True iff the list was retrieved, regardless of any executables being found.
     * @property {APIError} [err] - The error that caused the request to fail.
     * @property {object[]} [execs] - The list of executables uploaded, along with any properties set on them.
     */

    /**
     * API endpoint to retrieve the list of executables uploaded by a user.
     * @hbcsapi {GET} exec - This is an API endpoint.
     * @returns {ExecutableListAPIResponse} The API response providing the list of executables..
     */
    app.get('/exec', [auth.enforceLogin, express.multipart()], function(req, res) {

        db.zipsForUser(req.user, function(fErr, result) {
            if (fErr) {
                return res.send({
                  'res': false,
                  'msg': 'an error occured'
              });
            }
            return res.send({
                  'res': true,
                  'execs': result
              });
        });
    });

    /**
     * @typedef ExecUploadAPIResponse
     * @type {object}
     * @property {boolean} res - True iff the operation succeeded.
     * @property {APIError} [err] - The error that caused the request to fail.
     * @property {string[]} [ids] - A list of all the ids generated for each of the uploaded archives. The list will be ordered according to their order in the request body.
     */

    /**
     * API endpoint to upload an archive. This endpoint is irregular in that it accepts multipart form-encoded data, instead of JSON.
     * @hbcsapi {POST} img - This is an API endpoint.
     * @param {form-data} file - The body of the file to upload. In case of multiple file uploads, this can be any unique string.
     * @param {string} filename - The filename of the zip.
     * @param {string} name - The name of the executable.
     * @returns {ExecUploadAPIResponse} The API response providing the ids assigned to the archives, if successful.
     */
    app.post('/exec', [auth.enforceLogin, express.multipart()], function(req, res) {
        async.map(Object.keys(req.files), function(fKey, done) {
            var zInfo = req.files[fKey];
            zInfo.name = req.body.name;
            zInfo.fileContents = fs.readFileSync(zInfo.path);
            console.log(zInfo);
            return uploadZip(req.user, zInfo, db, done); // Will call done() for us;
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
        });  
    });
}

// Export public members.
module.exports = {
    jobRoutes: jobRoutes
};

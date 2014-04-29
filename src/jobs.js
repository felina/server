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
var auth = require('./auth/auth.js');
var db = require('./db.js');

// Load the AWS configuration file.
aws.config.loadFromPath('./config/aws.json');

/**
 * Global S3 client object, with configuration pre-loaded.
 */
var s3 = new aws.S3();

/**
 * The S3 bucket name to use for executable storage.
 */
var EXECUTABLE_BUCKET = 'citizen.science.executable.storage';

var IMAGE_BUCKET = 'citizen.science.image.storage';


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
 * @param {errorCallback} callback - The callback detailing whether upload was successful.
 */
function uploadZip(user, zInfo, callback) {
    console.log('Trying to upload: ' + zInfo.name);

    return db.tcAddNewZip(user, zInfo.name, zInfo.originalFilename, function(dbErr, id, accept) {
        if (dbErr) {
            // In case of a DB error, we don't need to notify the accept callback.
            console.log(dbErr);
            return callback(dbErr);
        } else {
            // The insertion succeeded, we now have an id and can put the object.
            var params = {
                'Bucket': EXECUTABLE_BUCKET,
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

/***
 ** API ROUTE FUNCTIONS
 **/

/**
 * @typedef ResultsAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the results were retrieved from the job server.
 * @property {APIError} [err] - The error that caused the request to fail.
 * @property {object} The results of the job. The formatting will be job dependent.
 */

/**
 * @typedef ProgressAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the progress was retrieved from the job server.
 * @property {APIError} [err] - The error that caused the request to fail.
 * @property {number} The approximate percentage completion of the job.
 */

/**
 * API endpoint to get the current progress or state of a job.
 * @hbcsapi {GET} /jobs/:jid - This is an API endpoint.
 * @param {number} :jid - The id of the job to lookup.
 * @param {boolean} [results=0] - If true, the results of the job will be returned.
 * @returns {ProgressAPIResponse|ResultsAPIResponse} progress - The percentage completion.
 */
function getJobsId(req, res) {
    var jobID = parseInt(req.params.jid);
    var resultsQ = parseInt(req.query.results);
    console.log(jobID, resultsQ);
    console.log(req.query);
    if (_.isNaN(jobID)) {
        return res.send(new errors.APIErrResp(2, 'Invalid job ID.'));
    } else if (resultsQ === 1) {
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
    } else {
        jsapi.getProgress(jobID, function(err, prog) {
            if (err) {
                return res.send(new errors.APIErrResp(3, 'Failed to retrieve job progress.'));
            } else {
                // var result = JSON.parse(prog);
                if (!prog.res) {
                    res.send(new errors.APIErrResp(4, 'Error retrieving job progress'));
                }
                delete prog.res;
                return res.send({
                    'res': true,
                    'progress': prog
                });
            }
        });
    }
}

/**
 * @typedef ExecutableListAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the list was retrieved, regardless of any executables being found.
 * @property {APIError} [err] - The error that caused the request to fail.
 * @property {object[]} [execs] - The list of executables uploaded, along with any properties set on them.
 */

/**
 * API endpoint to retrieve the list of executables uploaded by a user.
 * @hbcsapi {GET} /execs - This is an API endpoint.
 * @returns {ExecutableListAPIResponse} The API response providing the list of executables..
 */
function getExecs(req, res) {
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
}

/**
 * @typedef ExecUploadAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the operation succeeded.
 * @property {APIError} [err] - The error that caused the request to fail.
 * @property {string[]} [ids] - A list of all the ids generated for each of the uploaded archives. The list will be ordered according to their order in the request body.
 */

/**
 * API endpoint to upload an archive. This endpoint is irregular in that it accepts multipart form-encoded data, instead of JSON.
 * @hbcsapi {POST} /execs - This is an API endpoint.
 * @param {form-data} file - The body of the file to upload. In case of multiple file uploads, this can be any unique string.
 * @param {string} filename - The filename of the zip.
 * @param {string} name - The name of the executable.
 * @returns {ExecUploadAPIResponse} The API response providing the ids assigned to the archives, if successful.
 */
function postExecs(req, res) {
    async.map(Object.keys(req.files),
        function(fKey, done) {
            var zInfo = req.files[fKey];
            zInfo.name = req.body.name;
            zInfo.fileContents = fs.readFileSync(zInfo.path);
            console.log(zInfo);
            // return uploadZip(req.user, zInfo, db, done); // Will call done() for us;
            return uploadZip(req.user, zInfo, done); // Will call done() for us;
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
}


/**
 * API endpoint to start a job
 * @hbcsapi {POST} /start - This is an API endpoint.
 * @param {number} executable - The server identifier of the executable to be run
 * @param {string} name - The name of the job.
 * @param {string} command - The name of the executable so that it can be run
 * @param {string[]} images - Array of image identifiers
 * @returns {ExecUploadAPIResponse} The API response providing the ids assigned to the archives, if successful.
 */
function postStartJob(req, res) {
    console.log(req.body);
    // Get the image IDs for processing
    var executable = parseInt(req.body.executable, 10);
    var images = req.body.images;
    var command = req.body.command;
    var jobName = req.body.name;

    if ((!executable) && _.isNumber(executable)) {
        return res.send(new errors.APIErrResp(1, 'Invalid executable.'));
    } else if ((!command) && command.length > 0) {
        return res.send(new errors.APIErrResp(2, 'Invalid command.'));
    } else if ((!jobName) && jobName.length > 0) {
        return res.send(new errors.APIErrResp(3, 'Invalid job name.'));
    } else if ((!images) && images.length > 0 && images.length % 2 !== 0) {
        return res.send(new errors.APIErrResp(3, 'Invalid images.'));
    } else {
        var imageArray = [];
        for (var i = 0; i < images.length; i = i + 2) {
            imageArray.push({
                'Image1': {
                    'Key': images[i],
                    'Bucket': IMAGE_BUCKET
                },
                'Image2': {
                    'Key': images[i+1],
                    'Bucket': IMAGE_BUCKET
                }
            });
        }
        console.log(imageArray);
        db.addJob(executable, jobName, command, req.user.id, function(fErr, jobId, accept) {
            if (fErr) {
                console.log(fErr);
                return res.send(new errors.APIErrResp(1, fErr));
            }
            console.log(jobId);
            var windowsPostData = {
                'JobId': jobId,
                'ZipId': executable,
                'Privilege': true,
                'Command': command,
                'Work': imageArray
            };

            console.log(windowsPostData);
            for (var i = 0; i < windowsPostData['Work'].length; i++) {
                console.log(windowsPostData['Work'][i]);
            }
            jsapi.createJob(windowsPostData, function(err, windowsResult) {
                if (err) {
                    console.log(err);
                    accept(false);
                    return res.send(new errors.APIErrResp(2, err));
                }
                accept(true);
                // console.log(typeof(windowsResult));
                // result = JSON.parse(windowsResult);
                // console.log(windowsResult);
                if (!windowsResult.res) {
                    return res.send(new errors.APIErrorResp(2, result));
                } else {
                    return res.send({
                        'res': true, 
                        'code': 0, 
                        'message': windowsResult
                    });
                }
            });
        });
    } /*else {
        return res.send({'res':false, 'code': 2, // Do proper code checks
            'msg': 'Need to specify images and executable for a job'});
    }*/
}

/**
 * Registers Express routes related to job handling. These are API endpoints.
 * @static
 * @param {Express} app - The Express application object.
 */
function jobRoutes(app) {

    app.post('/start', auth.enforceLoginCustom({'minPL':'researcher'}), postStartJob);

    // Get all the jobs started by the researcher with the given id
    // TODO: Placeholder - actually get ID, read from database, etc.
    app.get('/jobs', auth.enforceLoginCustom({'minPL':'researcher'}), function(req, res) {
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

    app.get('/jobs/:jid', auth.enforceLoginCustom({'minPL':'researcher'}), getJobsId);
    app.get('/execs', auth.enforceLoginCustom({'minPL':'researcher'}).concat([express.multipart()]), getExecs);
    app.post('/execs', auth.enforceLoginCustom({'minPL':'researcher'}).concat([express.multipart()]), postExecs);
}

// Export public members.
module.exports = {
    jobRoutes: jobRoutes
};
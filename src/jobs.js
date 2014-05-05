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

/**
 * The S3 bucket name to use for image storage.
 */
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

/**
 * Gets the URL of a job results CSV.
 * @param {number} id - The id of the job to get results from.
 * @returns {string} The URL of the job results, or null if not found.
 */
function getResultsURL(id) {
    var params = {
        'Bucket': IMAGE_BUCKET + '.public', //TODO: Fix Windows server
        'Key': id + '.csv',
        'Expires': 30000
    };

    // Use a signed URL to serve directly from S3. Note that anyone with the URL can access the image until it expires!
    return s3.getSignedUrl('getObject', params); 
}

/***
 ** API ROUTE FUNCTIONS
 **/

/**
 * @typedef ResultsAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the results were retrieved from the job server.
 * @property {APIError} [err] - The error that caused the request to fail.
 * @property {string} [url] - The URL of the job results.
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
        // Assume the results are available.
        var url = getResultsURL(jobID);
        if (url) {
            return res.send({
                'res': true,
                'url': url
            });
        } else {
            return res.send(new errors.APIErrResp(3, 'Failed to get job results.'));
        }
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
    // Get the image IDs for processing
    var executable = parseInt(req.body.executable, 10);
    var images = req.body.images;
    var command = req.body.command;
    var jobName = req.body.name;

    if ((!executable) && _.isNumber(executable)) {
        return res.send(new errors.APIErrResp(1, 'Invalid executable.'));
    } else if ((!command) || (!command.length)) {
        return res.send(new errors.APIErrResp(2, 'Invalid command.'));
    } else if ((!jobName) || (!jobName.length)) {
        return res.send(new errors.APIErrResp(3, 'Invalid job name.'));
    } else if ((!images) || (!images.length) || images.length % 2 !== 0) {
        return res.send(new errors.APIErrResp(4, 'Invalid images.'));
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
                if (!windowsResult.res) {
                    return res.send(new errors.APIErrorResp(2, windowsResult));
                } else {
                    return res.send({
                        'res': true, 
                        'code': 0, 
                        'message': windowsResult
                    });
                }
            });
        });
    }
}

function getJobs(req, res) {
    console.log(req.query);
    return db.getJobs(req.user, req.query.done, function (err, result) {
        if (err) {
            console.log(err);
            return res.send(new errors.APIErrorResp(1, err));
        }
        if (req.query.done) {
            for (var i = 0; i < result.length; i++) {
                var job = result[i];
                job['Started'] = true;
                job['Completed'] = true;
                job['Paused'] = false;
                job['Progress'] = 1;
                job['message'] = 'potatoes';
            }
            return res.send({res: true, jobs: result});
        }
        return async.map(result, function(obj, callback) {
            return jsapi.getProgress(obj.jobid, function(uploadErr, prog) {
                if (err) {
                    console.log(uploadErr);
                    return callback(err);
                }
                // console.log(prog);
                for (var key in prog) {
                    var val = prog[key];
                    prog[key.toLowerCase()] = val;
                    delete prog[key];
                }
                if (req.query.debug) {
                    if (Math.random() > 0.8) {
                        prog.Progress = Math.random();
                        prog.Completed = false;
                    }
                }
                db.jobDone(prog.completed, prog.jobid, function(err, success) {
                    prog['name'] = obj.name;
                    return callback(null, prog);
                });
            });
        }, function(errDone, done) {
            if (errDone) {
                console.log(errDone);
                return res.send(new errors.APIErrorResp(1, errDone));
            }
            return res.send({
                'res': true,
                jobs: done
            }); 
        });
    });
}

/**
 * Registers Express routes related to job handling. These are API endpoints.
 * @static
 * @param {Express} app - The Express application object.
 */
function jobRoutes(app) {
//    app.get('/csvs/:id', auth.enforceLoginCustom({'minPL':'researcher'}),getCSVsId);
    
    app.post('/start', auth.enforceLoginCustom({'minPL':'researcher'}), postStartJob);

    // Get all the jobs started by the researcher with the given id
    // TODO: Placeholder - actually get ID, read from database, etc.
    app.get('/jobs', auth.enforceLoginCustom({'minPL':'researcher'}), getJobs);

    app.get('/jobs/:jid', auth.enforceLoginCustom({'minPL':'researcher'}), getJobsId);
    app.get('/execs', auth.enforceLoginCustom({'minPL':'researcher'}).concat([express.multipart()]), getExecs);
    app.post('/execs', auth.enforceLoginCustom({'minPL':'researcher'}).concat([express.multipart()]), postExecs);
}

// Export public members.
module.exports = {
    jobRoutes: jobRoutes
};

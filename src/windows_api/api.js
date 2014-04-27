/**
 * @module jobAPI
 */

var dns = require('dns');
var http = require('http');
var _ = require('underscore');

/**
 * The configuration defining the connection parameters of the job server.
 */
var target_config = require('../../config/job_server.json');

/**
 * The timeout to use when requesting information from the job server.
 */
var SOCKET_TIMEOUT_MILLIS = 30000;

/**
 * Runs a test to check the job server configuration.
 * @static
 * @param {errorCallback} callback - The callback that handles the test outcome.
 */
function init(callback) {
    // Check that the config has all required values set.
    var port = parseInt(target_config.port);
    if (_.isNaN(port)) {
        console.log('Invalid job server port: ' + port);
        return callback('Invalid job server port.');
    }
    var host = target_config.host;
    if (host && typeof host === 'string') {
        // try to resolve this host
        dns.lookup(host, function(err, address, family) {
            if (err) {
                console.log(err);
                return callback(err);
            } else {
                console.log('Using job server at: ' + host + ' (' + address + ') :' + port);
                return callback();
            }
        });
    } else {
        return callback('Invalid job host.');
    }
}

/**
 * Generic job server response callback.
 * @callback jobServerResponseCallback
 * @param {Error|string} err - The error that caused the request to fail.
 * @param {object} res - The object returned by the server, parsed from JSON.
 */

/**
 * Sends a HTTP POST request to the job server.
 * @param {string} path - The path of the resource to request.
 * @param {object} data - The data to JSON encode and submit in the body of the request.
 * @param {jobServerResponseCallback} callback - The callback that handles the request outcome.
 */
function jsPOST(path, data, callback) {
    var post_data = JSON.stringify(data);
    var post_options = {
        'host': target_config.host,
        'port': target_config.port,
        'path': path,
        'method': 'POST',
        'headers': {
            'Content-Type': 'application/json',
            'Content-Length': post_data.length
        }
    };

    var post_req = http.request(post_options, function(res) {
        console.log('Job server status code: ' + res.statusCode);
        if (res.statusCode === 200) {
            var resData = '';
            res.setEncoding('utf8');
            res.on('data', function(dPart) {
                console.log('Received part from job server.');
                resData += dPart;
            });
            res.on('end', function() {
                console.log('Job server response done.');
                var resParsed = {};

                try {
                    resParsed = JSON.parse(resData);
                } catch (e) {
                    console.log('Job server response was not valid JSON!.');
                    console.log(resData);
                    return callback('Invalid response formatting.');
                }

                return callback(null, resParsed);
            });
        } else {
            return callback(res.statusCode);
        }
    });

    post_req.setTimeout(SOCKET_TIMEOUT_MILLIS, function() {
        console.log('Job server request timed out.');
        return callback('Job server timed out.');
    });

    post_req.on('error', function(err) {
        console.log(err);
        return callback(err);
    });

    post_req.write(post_data);
    post_req.end();
}

/**
 * Sends a HTTP GET request to the job server.
 * @param {string} path - The path of the resource to request, including any URL parameters.
 * @param {jobServerResponseCallback} callback - The callback that handles the request outcome.
 */
function jsGET(path, callback) {
    var get_options = {
        'host': target_config.host,
        'port': target_config.port,
        'path': path
    };

    var get_req = http.get(get_options, function(res) {
        if (res.statusCode === 200) {
            var resData = '';
            res.setEncoding('utf8');
            res.on('data', function(dPart) {
                console.log('Received part from job server.');
                resData += dPart;
            });
            res.on('end', function() {
                console.log('Job server response done.');
                var resParsed = {};

                try {
                    resParsed = JSON.parse(resData);
                } catch (e) {
                    console.log('Job server response was not valid JSON!.');
                    console.log(resData);
                    return callback('Invalid response formatting.');
                }

                return callback(null, resParsed);
            });
        } else {
            return callback(res.statusCode);
        }
    });

    get_req.setTimeout(SOCKET_TIMEOUT_MILLIS, function() {
        console.log('Job server request timed out.');
        return callback('Job server timed out.');
    });

    get_req.on('error', function(err) {
        console.log(err);
        return callback(err);
    });
}

/**
 * Creates a job on the job server.
 * @static
 * @param {Job} job - The job to send to the server.
 * @param {jobServerResponseCallback} callback - The callback that handles the server's response.
 */
function createJob(job, callback) {
    return jsPOST(
        '/api/createjob',
        job,
        function(err, res) {
            if (err) {
                console.log(err);
                return callback(err);
            } else {
                return callback(null, res);
            }
        }
    );
}

/**
 * Fetches a job's progress from the job server.
 * @static
 * @param {number} jobid - The id of the job to lookup.
 * @param {jobServerResponseCallback} callback - The callback that handles the server's response.
 */
function getProgress(jobid, callback) {
    return jsGET('/api/JobProgress?jobid=' + encodeURIComponent(jobid), function(err, res) {
        if (err) {
            console.log(err);
            return callback(err);
        } else {
            return callback(null, res);
        }
    });
}

/**
 * Fetches a job's results from the job server.
 * @static
 * @param {number} jobid - The id of the job to lookup.
 * @param {jobServerResponseCallback} callback - The callback that handles the results of the job.
 */
function getResults(jobid, callback) {
    return jsGET('/api/JobResults?jobid=' + encodeURIComponent(jobid), function(err, res) {
        if (err) {
            console.log(err);
            return callback(err);
        } else {
            return callback(null, res);
        }
    });
}

/**
 * Supported actions when controlling a job.
 *
 * PAUSE   : The job should be paused, to resume execution in the future.
 * STOP    : The job should be cancelled, and should not be able to be resumed.
 * RESUME  : The job should be resumed from the point where it was paused.
 * RESTART : The job should be restarted from the beginning, discarding it's results
 * @static
 */
var JOB_CONTROL_ACTIONS = ['PAUSE', 'STOP', 'RESUME', 'RESTART'];

// If terminate, the job should be cancelled and will not be possible to be resumed.

/**
 * Sends a job control action to the job server.
 * @static
 * @param {number} jobid - The id of the job to control.
 * @param {string} action - The action to attempt on the job.
 * @param {jobServerResponseCallback} callback - The callback that handles the server's response.
 */
function controlJob(jobid, action, callback) {
    if (JOB_CONTROL_ACTIONS.indexOf(action) < 0) {
        return callback('Invalid action.');
    } else {
        return jsPOST('/api/JobControl',
                      {
                          'jobid': jobid,
                          'action': action
                      },
                      function(err, res) {
                          if (err) {
                              console.log(err);
                              return callback(err);
                          } else {
                              return callback(null, res);
                          }
                      });
    }
}

/**
 * Fetches the queue of jobs from the job server.
 * @static
 * @param {jobServerResponseCallback} callback - The callback that handles the server's job queue.
 */
function getQueue(callback) {
    return jsGET('/api/JobQueue', function(err, res) {
        if (err) {
            console.log(err);
            return callback(err);
        } else {
            return callback(null, res);
        }
    });
}

// Export all public members.
module.exports = {
    init: init,
    createJob: createJob,
    getProgress: getProgress,
    getResults: getResults,
    JOB_CONTROL_ACTIONS: JOB_CONTROL_ACTIONS,
    controlJob: controlJob,
    getQueue: getQueue
};

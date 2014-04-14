var dns = require('dns');
var http = require('http');
var _ = require('underscore');
var target_config = require('../../config/job_server.json');

var SOCKET_TIMEOUT_MILLIS = 30000;

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

// callback(err, res)
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

// callback(err, res)
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

function createJob(jobid, zipid, pairsList, callback) {
    return jsPOST('/api/JobCreate',
                  {
                      'jobid': jobid,
                      'zipid': zipid,
                      'work': pairsList
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

var JOB_CONTROL_ACTIONS = ['PAUSE', 'STOP', 'RESUME', 'RESTART'];

// If terminate, the job should be cancelled and will not be possible to be resumed.
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

module.exports = {
    init: init,
    createJob: createJob,
    getProgress: getProgress,
    getResults: getResults,
    JOB_CONTROL_ACTIONS: JOB_CONTROL_ACTIONS,
    controlJob: controlJob,
    getQueue: getQueue
};

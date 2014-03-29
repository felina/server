var dns = require('dns');
var http = require('http');
var _ = require('underscore');
var target_config = require('../../config/job_server.json');

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

function createJob(jobid, zipid, pairsList) {
    var post_data = JSON.stringify({
        'jobid': jobid,
        'zip': zipid,
        'work_units': pairsList
    });

    var post_options = {
        'host': target_config.host,
        'port': target_config.port,
        'path': '/api/CreateJob',
        'method': 'POST',
        'headers': {
            'Content-Type': 'application/json',
            'Content-Length': post_data.length
        }
    };

    var post_req = http.request(post_options, function(res) {
        res.setEncoding('utf8');
        res.on('data', function(data) {
            console.log(data);
        });
    });

    post_req.write(post_data);
    post_req.end();
}

module.exports = {
    init: init
};

var _ = require('underscore');
var errors = require('./error.js');

function jobRoutes(app, db) {
    // Job start req
    app.post('/start', function(req, res) {
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
    // For now, assume progress = percentage of possible images sent to processor
    app.get('/progress', function(req, res) {
        var jobID = parseInt(req.query.id);

        if (_.isNaN(jobID)) {
            return res.send(new errors.APIErrResp(2, 'Invalid job id.'));
        } else {
            db.getJobImageCount(jobID, function(err, prog) {
                if (err) {
                    return res.send(new errors.APIErrResp(3, 'Failed to retrieve job progress.'));
                } else if (prog[0].total === 0) {
                    return res.send(new errors.APIErrResp(4, 'Job id does not exist.'));
                } else {
                    return res.send({
                        'res': true,
                        'processed': prog[0].processed,
                        'total': prog[0].total
                    });
                }
            });
        }
    });

    // Job results
    app.get('/results', function(req, res) {
        var jobID = req.get('jobID');
        if (jobID) {
            console.log('Job results req: jobID ' + jobID);
            // TODO: Query job server
            return res.send({
                'res': true,
                'data': [{
                    'some': 'data'
                }, {
                    'some more': 'data'
                }]
            });
        } else {
            return res.send(new errors.APIErrResp(2, 'No jobID provided'));
        }
    });

    // Get all the jobs started by the researcher with the given id
    // TODO: actually get ID, read from database, etc.
    app.get('/jobs', function(req, res) {
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

    app.post('/target', function() {
        console.log('posted executable to target');
    });

    app.post('/exec', function(req, res) {

    });
}

module.exports = {
    jobRoutes: jobRoutes
};

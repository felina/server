var express = require('express');
var passport = require('passport');
var path = require('path');
var fs = require('fs');
var auth = require('./auth/auth.js');
var users = require('./user.js');
var _ = require('underscore');
var md5 = require('MD5');
var aws = require('aws-sdk');
var db = require('./db.js');
var images = require('./images.js');

// Setup passport
auth.authSetup(passport);

// Init express application
app = express();

// Forgotten headers?
var allowCrossDomain = function(req, res, next) {
    res.set('Access-Control-Allow-Credentials', 'true');
    //res.set('Access-Control-Allow-Origin', 'http://localhost:9000');
    res.set('Access-Control-Allow-Origin', req.headers.origin);
    res.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Cache-Control, X-HTTP-Method-Override, Accept');

    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
      res.send(200);
    }
    else {
      next();
    }
};

app.configure(function () {
    app.use(allowCrossDomain);
    app.use(express.static('public'));
    app.use(express.static(__dirname + '/static'));
    app.use(express.logger());
    app.use(express.cookieParser());
    // bodyParser is deprecated, replaced by json and urlencoded
    //app.use(express.bodyParser()); 
    app.use(express.json());
    app.use(express.urlencoded());
    app.use(express.multipart());
    aws.config.loadFromPath('./aws.json');
    // console.log(aws.config);
    app.use(express.session({ secret: 'I should be something else' }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(app.router);
});

var s3 = new aws.S3();

// TEMP Hello world
app.get('/', function(req, res) {
    return res.send('FELINA API SERVER\n');
});

// Import various auth routes/endpoints
auth.authRoutes(app);

// Root callback - show req
app.post('/', function (req, res) {
    console.log(req);
    return res.send('Ack');
});

app.post('/upload/metadata', /*auth.enforceLogin,*/ function(req, res) {
    // Check that we've been sent an array
    if (_.isArray(req.body)) {
	var md = null;
	// This is very un-node like. array.forEach(...)!
	for (var i = 0; i < req.body.length; i++) {
	    md = req.body[i];
	    console.log(md.id);
	    var id = null;
	    if (md.id) {
		id = md.id;
		var datetime = null;
		if (md.datetime) {
		    datetime = md.datetime;
		}
		var location = null;
		if (md.location) {
		    location = md.location;
		}
		var priv = true;
		if (md.priv) {
		    priv = md.priv;
		}
		var annotations = [];
		if (md.annotations && _.isArray(md.annotations)) {
		    annotations = md.annotations;
		}
		console.log('Adding md to db.');
		db.addImageMeta(id, datetime, location, priv, annotations, function(err, out) {
		    console.log(err);
		    console.log(out);
		});
	    } else {
		// No id specified! Mark as error.
		console.log('Metadata missing id!');
	    }
	}
    } else {
	// Not sent a list!
	console.log('Not a metadata list!');
    }
    res.send('lolwut\n');
});

// Import image routes
images.imageRoutes(app, db, auth);

app.get('/img/:id/meta', function(req, res) {
    // TODO: Allow logged out viewing
    if (req.user) {
	db.checkImagePerm(req.user, req.params.id, function(err, bool) {
	    if (bool) {
		db.getMetaBasic(req.user.id, req.params.id, function (err, meta) {
		    if (err) {
			res.send({'res':false, 'err':{'code':2, 'msg':'Failed to retrieve metadata.'}});
		    } else {
			res.send({'res':true, 'meta':meta});;
		    }
		});
	    } else {
		res.send({'res':false, 'error':{'code':1,'msg':'You do not have permission to access this image.'}});
	    }
	});
    } else {
	res.send({'res':false, 'excuse':'I AM BROKEN AND YOURE NOT LOGGED IN'});
    }
});

// Job start req
app.post('/start', function (req, res) {
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
app.get('/progress', function (req, res) {
    var jobID = req.get('jobID');
    if (jobID) {
        console.log('Job progress req: jobID ' + jobID);
        // TODO: Query job server
        var progress = 0.74;
        return res.send({ 'progress': progress });
    }
    else {
        return res.send('No jobID provided');
    }
});

// Job results
app.get('/results', function (req, res) {
    var jobID = req.get('jobID');
    if (jobID) {
        console.log('Job results req: jobID ' + jobID);
        // TODO: Query job server
        return res.send({ 'data': [{ 'some': 'data' }, { 'some more': 'data' }] });
    }
    else {
        return res.send('No jobID provided');
    }
});

app.post('/target', function (req, res) {
    console.log('posted executable to target')
});

// Start listening
port = process.env.PORT || 5000;

app.listen(port, function() {
    return console.log("Listening on " + port);
});


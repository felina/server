var express = require('express');
var passport = require('passport');
var fbStrategy = require('passport-facebook').Strategy;
var fbConfig = require('./fb.json');
var path = require('path');
var fs = require('fs');
var auth = require('./localauth.js');
var users = require('./user.js');
var mysql = require('mysql');
var _ = require('underscore');
var md5 = require('MD5');
var aws = require('aws-sdk');
var db = require('./db.js');
// var png = require('png-js');

passport.serializeUser(function(user, done) {
    // Stores the user's id into session so we can retrieve their info on next load.
    done(null, user.id);
});

passport.deserializeUser(function(id, done) {
    // Loads the user object by id and returns it via the callback.
    db.getUser(id, done);
});

// User login config
// TODO: This looks wrong?
passport.use(auth.LocalStrategy);
// Make sure that passReq is enabled in fbConfig
fbConfig.passReqToCallback = true;
passport.use(new fbStrategy(fbConfig, function(req, accessToken, refreshToken, profile, done) {
    db.extGetUser(profile.id, profile.provider, req.user, function(err, user) {
	if (err) {
	    return done(err);
	} else {
	    done(null, user);
	}
    });
}));

// Init express application
app = express();

// Forgotten headers?
var allowCrossDomain = function(req, res, next) {
    res.set('Access-Control-Allow-Origin', 'http://localhost:9000');
    // res.header('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Cache-Control');

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
    //app.use(express.logger());
    app.use(express.cookieParser());
    // bodyParser is deprecated, replaced by json and urlencoded
    //app.use(express.bodyParser()); 
    app.use(express.json());
    app.use(express.urlencoded());
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

// Facebook auth routes
app.get('/login/facebook', passport.authenticate('facebook'));
app.get('/login/facebook/callback', passport.authenticate('facebook', {successRedirect: '/logincheck', failureRedirect: '/logincheck'}));
// End Facebook auth

app.get('/logout', function(req, res) {
    if (req.user) {
	req.logout();
    }
    res.send({'res':true});
});

app.post('/register', function(req, res) {
    if (req.body.user) {
	var mail = req.body.mail;
	var name = req.body.name;
	var pass = req.body.pass;
	var priv = users.PrivilegeLevel.USER.i;
	var user = new users.User(-1, name, mail, priv);
	auth.register(user, pass, function(err, id) {
	    if (err) {
		// Registration failed, notify api.
		console.log('Registration failed:');
		console.log(err);
		res.send({'res':false, 'err':err});
	    } else {
		// Update id from DB insertion.
		user.id = id;
		console.log(['Registered user:',id,mail,pass,name,priv].join(" "));
		res.send({'res':true, 'user':user});
		// Login the newly registered user.
		req.login(user, function(err) {
		    if (err) {
			// Login failed for some reason.
			console.log('Post registration login failed:')
			console.log(err);
		    }
		});
	    }	
	});
    } else {
	res.send({'res':false, 'err':'Invalid request.'});
    }
});

// Login callback - user auth
app.post('/login', function(req, res, next) {
    passport.authenticate('local', function(err, user, info) {
	if (err) {
	    return next(err);
	} else if (!user) {
	    return res.send({'res':false, 'err':'No user'});
	}
	req.logIn(user, function(err) {
	    if (err) {
		return next(err);
	    } else {
		return res.send({'res':true, 'user':user});
	    }
	});
    })(req, res, next);
});

// Middleware to enforce login.
// stackoverflow.com/questions/18739725/
function enforceLogin(req, res, next) {
    // user will be set if logged in
    if (req.user) {
	next(); // Skip to next middleware
    } else {
	// Send a generic error response.
	res.send({'res':false, 'err':{'code':1, 'msg':'You must be logged in to access this feature.'}});
    }
}

// Checks if user is logged in, returns the user object.
app.get('/logincheck', enforceLogin, function(req, res) {
    res.send({'res':true, 'user':req.user});
});

// Root callback - show req
app.post('/', function (req, res) {
    console.log(req);
    return res.send('Ack');
});

function fileType(filePath) {
    filetype = ""
    for (var i = filePath.length; i > 0; i--) {
        if (filePath[i] === '.') {
            return filePath.slice(i + 1, filePath.length);
        }
    }
    return null;
}

// Endpoint to get list of images
app.get('/images', enforceLogin, function(req, res) {
    db.getUserImages(req.user, function(err, result) {
	if (err) {
	    res.send({'res':false, 'err':{'code':2, 'msg':'Could not load image list.'}});
	} else {
	    res.send({'res':true, 'images':result});
	}
    });
});

app.get('/img/:id', function(req, res) {
    //req.params.id
    if (req.user) {
	db.checkImagePerm(req.user, req.params.id, function(err, bool) {
	    if (bool) {
		proxyImage(req.params.id, res);
	    } else {
		res.redirect('/Padlock.png');
	    }
	});
    } else {
	res.redirect('/Padlock.png');
    }
});

function proxyImage(id, res) {
    var params = {'Bucket':'citizen.science.image.storage', 'Key':id};
    s3.getObject(params).createReadStream().pipe(res);
};

// Image/s upload endpoint
app.post('/upload/img', enforceLogin, function (req, res, next) {
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
            var imageObject = {"imageData" : fileContents, "imageType" : fileType(imageFilePath), "imageHash" : imageHash};
            uploadImage(req.user, imageObject);
        }
    } else {
        resultObject.status.code = 1;
        resultObject.status.message = "No images uploaded";
    }
    return res.send(resultObject);
});

// app.get('img/:name')

function uploadImage(user, imageObject) {
    params = {};
    params.Bucket = 'citizen.science.image.storage';
    params.Body = imageObject.imageData;
    params.Key = imageObject.imageHash;
    s3.putObject(params, function (err, data) {
        if (err) {
            console.log("uploadImage error: " + err);
        } else {
	    db.addNewImage(user, {'id':1, 'name':'dummy'}, imageObject);
	}
        console.log(data);
    })
};

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


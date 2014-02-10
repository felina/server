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
var jobs = require('./jobs.js');
var meta = require('./meta.js');

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

// Import image routes
images.imageRoutes(app, auth, db);

// Import metadata routes
meta.metaRoutes(app, auth, db);

// Import job related routes, mostly dummy endpoints for now
jobs.jobRoutes(app);

// Start listening
port = process.env.PORT || 5000;

app.listen(port, function() {
    return console.log("Listening on " + port);
});


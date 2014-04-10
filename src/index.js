#! /usr/bin/env node
 
var API_VERSION = '0.1.0';
//testaddition
var express = require('express');
var passport = require('passport');
var auth = require('./auth/auth.js');
var db = require('./db.js');
var images = require('./images.js');
var jobs = require('./jobs.js');
var meta = require('./meta.js');
var projects = require('./projects.js');
var user = require('./user.js');

// Check db settings
db.init(function(err) {
    if (err) {
	console.log(err);
	throw new Error('Database Unvailable. Your database settings are incorrect, the server is down, or you have not completed installation. Refusing to start!');
    }
});

// Setup passport
auth.authSetup(passport);

// Init express application
var app = express();

// Forgotten headers?
var allowCrossDomain = function(req, res, next) {
    res.set('Access-Control-Allow-Credentials', 'true');
    //res.set('Access-Control-Allow-Origin', 'http://localhost:9000');
    res.set('Access-Control-Allow-Origin', req.headers.origin);
    res.set('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,DELETE,OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, Cache-Control, X-HTTP-Method-Override, Accept');

    // intercept OPTIONS method
    if ('OPTIONS' === req.method) {
      res.send(200);
    } else {
      next();
    }
};

app.configure(function() {
    app.use(allowCrossDomain);
    app.use(express.logger('dev'));
    app.use(express.static(__dirname + '/../static'));
    app.use(express.cookieParser());
    app.use(express.json());
    app.use(express.urlencoded());
    app.use(express.session({
        secret: 'I should be something else'
    }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(app.router);
});

// Give API version on root.
app.get('/', function(req, res) {
    return res.send({
        res: true,
        version: API_VERSION
    });
});

// Import various auth routes/endpoints
auth.authRoutes(app);

// Import project routes
projects.projectRoutes(app, auth, db);

// Import image routes
images.imageRoutes(app, auth, db);

// Import metadata routes
meta.metaRoutes(app, auth, db);

// Import job related routes, mostly dummy endpoints for now
jobs.jobRoutes(app, auth, db);

// Import user routes
user.userRoutes(app, auth, db);

// Start listening
var port = process.env.PORT || 5000;

app.listen(port, function() {
    return console.log("Listening on " + port);
});

#! /usr/bin/env node

/**
 * @module main
 */

/**
 * The version of the API we are implementing.
 */
var API_VERSION = '0.1.0';
//testaddition
var express = require('express');
var passport = require('passport');
var users = require('./users.js');
var auth = require('./auth/auth.js');
var db = require('./db.js');
var images = require('./images.js');
var jobs = require('./jobs.js');
var meta = require('./meta.js');
var projects = require('./projects.js');
var jobAPI = require('./windows_api/api.js');

// Call the init function on the database to check configuration.
db.init(function(err) {
    if (err) {
	console.log(err);
	throw new Error('Database Unvailable. Your database settings are incorrect, the server is down, or you have not completed installation. Refusing to start!');
    }
});

// Check job server settings
jobAPI.init(function(err) {
    if (err) {
        throw new Error('Job server settings are incorrect. Refusing to start!');
    }
});

// Setup passport
auth.authSetup(passport);

// Init express application
var app = express();

/**
 * Express middleware to enable support for CORS.
 */
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

// Configure Express to use the various middleware we require.
app.configure(function() {
    // Enable CORS.
    app.use(allowCrossDomain);
    // Enable the request logger, with dev formatting.
    app.use(express.logger('dev'));
    // Enable serving of static files from the static folder.
    app.use('/static', express.static(__dirname + '/../static'));
    // Enable the parsing of cookies for session support.
    app.use(express.cookieParser());
    // Enable JSON parsing for all request bodies.
    app.use(express.json());
    // Enable Express session management.
    app.use(express.session({
        secret: 'I should be something else'
    }));
    // Enable Passport based authentication.
    app.use(passport.initialize());
    // Enable persistent login sessions.
    app.use(passport.session());
    // Enable the dynamic request router.
    app.use(app.router);
});

/**
 * @typedef VersionAPIResponse
 * @type {object}
 * @property {boolean} res - Always true.
 * @property {string} version - The API version this server is providing.
 */

/**
 * API endpoint to expose the API version.
 * @hbcsapi {GET} '/' - This is an API endpoint.
 * @returns {VersionAPIResponse} The API response detailing the API version.
 */
app.get('/', function(req, res) {
    return res.send({
        res: true,
        version: API_VERSION
    });
});

// Import various auth routes/endpoints
auth.authRoutes(app);

// Import project routes
projects.projectRoutes(app);

// Import image routes
images.imageRoutes(app);

// Import metadata routes
meta.metaRoutes(app);

// Import job related routes, mostly dummy endpoints for now
jobs.jobRoutes(app);

// Import user routes
users.userRoutes(app);

/**
 * The port the server will listen on.
 * This will be taken from the PORT environment variable if possible, else it will default to 5000.
 */
var port = process.env.PORT || 5000;

// Start the server.
app.listen(port, function() {
    return console.log("Listening on " + port);
});

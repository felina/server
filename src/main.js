#! /usr/bin/env node

/**
 * @module main
 */

/**
 * The version of the API we are implementing.
 */
var API_VERSION = '1.0.0';
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
var fs = require('fs');
var https = require('https');
var RedisStore = require('connect-redis')(express);

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

/**
 * Express middleware to respond to robots.txt requests.
 */
var robots = function(req, res, next) {
    if (req.originalUrl === '/robots.txt') {
        // Send a basic robots.txt which disallows all.
        res.type('text/plain');
        return res.send('User-agent: *\nDisallow: /');
    } else {
        // Ignore this request
        return next();
    }
};

/**
 * Options to use when storing sessions in Redis.
 */
var redisOpts = {
    'host': 'localhost',
    'port': '6379',
    'db': 0,
    'ttl': 60 * 60,
    'prefix': 'darwinSess:'
};

// Configure Express to use the various middleware we require.
app.configure(function() {
    // Disallow crawlers from accessing the API.
    app.use(robots);
    // Enable CORS.
    app.use(allowCrossDomain);
    // Enable the request logger, with dev formatting.
    app.use(express.logger('dev'));
    // Enable serving of static files from the static folder.
    app.use('/static', express.static(__dirname + '/../static'));
    // Enable the parsing of cookies for session support.
    app.use(express.cookieParser());
    // Enable Express session management.
    app.use(express.session({
        store: new RedisStore(redisOpts),
        secret: 'I should be something else'
    }));
    // Enable JSON parsing for all request bodies.
    app.use(express.json());
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
 * @hbcsapi {GET} / - This is an API endpoint.
 * @returns {VersionAPIResponse} The API response detailing the API version.
 */
function getRoot(req, res) {
    return res.send({
        res: true,
        version: API_VERSION
    });
}

// Setup the root API endpoint.
app.get('/', getRoot);

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

// Only use HTTP if we've been forced to do so.
if (process.argv.length > 2 && process.argv[2] === '-forceHTTP') {
    console.log('WARNING: Forcing HTTP, this should only be used for development purposes!');
    // Start the server.
    app.listen(port, function() {
        return console.log("Listening on " + port);
    });
} else {
    var https_options = null;

    try {
        https_options = {
            "key": fs.readFileSync('./config/ssl-key.pem'),
            "cert": fs.readFileSync('./config/ssl-cert.pem')
        };

        https.createServer(https_options, app).listen(port);
        console.log("Listening on (SSL) " + port);
    } catch (e) {
        // An error occurred reading the SSL keys.
        console.log("Failed to start server: " + e);
        process.exit(1);
    }
}

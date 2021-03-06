/**
 * @module auth
 */

var _ = require('underscore');
var loauth = require('./localauth.js');
var extauth = require('./externalauth.js');
var db = require('../db.js');
var errors = require('../error.js');

/**
 * Express middleware to only allow access to the resource to a logged in user.
 * @static
 */
function enforceLogin(req, res, next) {
    // user will be set if logged in
    if (req.user) {
        next(); // Skip to next middleware
    } else {
        // Send a generic error response.
        res.send(new errors.APIErrResp(1, 'You must be logged in to access this feature.'));
    }
}

/**
 * @typedef userVerifier
 * @type {function}
 * @param {user.User} user - The user trying to request the resource.
 * @returns {boolean} The trut value indicating if the request should be allowed to continue or not.
 */

/**
 * @typedef EnforceLoginOptions
 * @type {object}
 * @property {string[]} [ips] - A list of ips to restrict access to.
 * @property {string} [minPL] - The minimum usertype to allow access to the resource.
 * @property {userVerifier} [verifier] - A function that decides if the request should continue, given the user object.
 */

/**
 * Function to create Express middleware based upon an options object, that will enforce various access restrictions.
 * @static
 * @param {EnforceLoginOptions} options - The options that specify the restrictions this middleware will enforce.
 * @returns {function[]} The Express middlewares to add to the route definition.
 */
function enforceLoginCustom(options) {
    // The other middlewares we might use expect the user to be logged in.
    var middlewares = [ enforceLogin ];

    if (options === null || typeof options === 'undefined') {
        // options hasn't been supplied, fall back to standard behaviour
        return middlewares;
    }

    if (_.isArray(options.ips)) {
        middlewares.push(function(req, res, next) {
            // This layer should filter based on client IP.
            if (options.ips.indexOf(req.ip) >= 0) {
                return next();
            } else {
                return res.send(new errors.APIErrResp(1, 'You may only access this resource from a trusted client.'));
            }
        });
    }

    if (_.isString(options.minPL)) {
        middlewares.push(function(req, res, next) {
            // This layer should enforce a login level.
            console.log(options.minPL);
            console.log(req.user);
            if (req.user.isType(options.minPL, true)) {
                return next();
            } else {
                return res.send(new errors.APIErrResp(1, 'Insufficient user level for this resource.'));
            }
        });
    }
    if (_.isArray(options.id)) {
        middlewares.push(function(req, res, next) {
            // This layer should restrict the resource to a subset of user ids.
            if (options.id.indexOf(req.user.id) >= 0) {
                return next();
            } else {
                return res.send(new errors.APIErrResp(1, 'You are not allowed to access this resource.'));
            }
        });
    }
    if (_.isFunction(options.verifier)) {
        middlewares.push(function(req, res, next) {
            // This layer uses a custom verifier function acting on a user object.
            var vOut = options.verifier(req.user);
            if (vOut === true) {
                return next();
            } else {
                return res.send(new errors.APIErrResp(1, vOut));
            }
        });
    }

    return middlewares;
}

/**
 * Function to setup Passport for use throughout the application.
 * @static
 * @param {object} passport - The main Passport object.
 */
function authSetup(passport) {
    passport.serializeUser(function(user, done) {
        // Stores the user's id into session so we can retrieve their info on next load.
        done(null, user.id);
    });

    passport.deserializeUser(function(id, done) {
        // Loads the user object by id and returns it via the callback.
        db.getUser(id, done);
    });

    // User login config
    passport.use(loauth.LocalStrategy);

    // Use login provider from extauth to support FB login.
    passport.use(extauth.fbStrategy);
}

/***
 ** API ROUTE FUNCTIONS
 **/

/**
 * API endpoint to destory the user's session, logging out the current user.
 * @hbcsapi {POST} /logout - This is an API endpoint.
 * @returns {BasicAPIResponse} The API response detailing the outcome of the logout operation.
 */
function postLogout(req, res) {
    if (req.user) {
        req.logout();
        req.session.destroy(function (err) {
            return res.send({
                'res': true
            });
        });
    } else {
        return res.send(new errors.APIErrResp(1, 'You were not logged in.'));
    }
}

/**
 * @typedef UserAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the user is logged in.
 * @property {APIError} [err] - The error that occured trying to verify the user's login state.
 * @property {user.User} [user] - The user object of the current user.
 */

/**
 * API endpoint to check that the requester is logged in, and to retrieve their user info.
 * @hbcsapi {GET} /user - This is an API endpoint.
 * @returns {UserAPIResponse} The API response providing the currently logged in user's information.
 */
function getUser(req, res) {
    // Response to not logged in users will be provided by the middleware.
    return res.send({
        'res': true,
        'user': req.user
    });
}

/**
 * Registers Express routes related to authorization actions. These are API endpoints.
 * @static
 * @param {Express} app - The Express application object.
 */
function authRoutes(app) {
    // Import the facebook auth routes
    extauth.fbRoutes(app);

    // Import the local auth routes
    loauth.authRoutes(app, enforceLoginCustom);

    app.post('/logout', postLogout);
    app.get('/user', enforceLogin, getUser);
}

// Export all public members.
module.exports = {
    authSetup:authSetup,
    authRoutes:authRoutes,
    enforceLogin:enforceLogin,
    enforceLoginCustom:enforceLoginCustom
};

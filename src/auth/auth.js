var _ = require('underscore');
var loauth = require('./localauth.js');
var extauth = require('./externalauth.js');
var users = require('../user.js');
var db = require('../db.js');
var errors = require('../error.js');

// Middleware to enforce login.
// stackoverflow.com/questions/18739725/
function enforceLogin(req, res, next) {
    // user will be set if logged in
    if (req.user) {
        next(); // Skip to next middleware
    } else {
        // Send a generic error response.
        res.send(new errors.APIErrResp(1, 'You must be logged in to access this feature.'));
    }
}

function enforceLoginCustom(options, req, res, next) {
    if (options === null || typeof options === 'undefined') {
        // options hasn't been supplied, fall back to standard behaviour
        return enforceLogin;
    } else if (req !== null && typeof req !== 'undefined') {
        // req has been set, it looks like this is being used as middleware without having set options!
        // fall back to default behaviour
        console.trace('Improper usage of enforceLogin, attempting default behaviour!');
        return enforceLogin(req, res, next);
    }

    var middlewares = [ enforceLogin ];

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
    var minPL = users.privilegeFromString(options.minPL);
    if (minPL !== false) {
        middlewares.push(function(req, res, next) {
            // This layer should enforce a login level.
            if (req.user.privilege.i >= minPL) {
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

function authRoutes(app) {
    // Import the facebook routes
    extauth.fbRoutes(app);

    // Import the local auth routes
    loauth.authRoutes(app, enforceLoginCustom);

    app.get('/logout', function(req, res) {
        if (req.user) {
            req.logout();
            req.session.destroy(function (err) {
                res.send({'res':true});
            });
        } else {
            res.send(new errors.APIErrResp(1, 'You were not logged in.'));
        }
    });

    // Checks if user is logged in, returns the user object.
    app.get('/logincheck', enforceLogin, function(req, res) {
        res.send({'res':true, 'user':req.user});
    });
}

module.exports = {
    authSetup:authSetup,
    authRoutes:authRoutes,
    enforceLogin:enforceLogin,
    enforceLoginCustom:enforceLoginCustom
};

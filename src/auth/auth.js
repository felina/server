var loauth = require('./localauth.js');
var extauth = require('./externalauth.js');
var users = require('../user.js');
var db = require('../db.js');

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
    loauth.authRoutes(app);

    app.get('/logout', function(req, res) {
        if (req.user) {
            req.logout();
            req.session.destroy(function (err) {
                res.send({'res':true});
            });
        } else {
            res.send({'res':false});
        }
    });

    // Checks if user is logged in, returns the user object.
    app.get('/logincheck', enforceLogin, function(req, res) {
        res.send({'res':true, 'user':req.user});
    });
}

module.exports = {authSetup:authSetup, authRoutes:authRoutes, enforceLogin:enforceLogin};

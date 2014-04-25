/**
 * @module localauth
 */

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var db = require('../db.js');
var User = require('../models/User.js');
var errors = require('../error.js');
var nodemailer = require('nodemailer');
var crypto = require('crypto');
var bcrypt = require('bcrypt-nodejs');
var util = require('../util.js');

/**
 * Configuration to use for sending emails.
 */
var smtp_config = require('../../config/smtp.json');

/**
 * Email client to use.
`*/
var transport = nodemailer.createTransport("SMTP", smtp_config);

/**
 * The host of this API server.
 * @TODO Refactor this elsewhere
 */
var host = (process.env.HOST||'nl.ks07.co.uk')+':'+(process.env.PORT || 5000);

// TODO: Remove me!
var dbCFG = require('../../config/db_settings.json'); 

/**
 * Registers a new user with email/password authentication. Will send an email verification to the user's email address.
 * @static
 * @param {user.User} user - The user to create. The id and privilege level will be overwritten.
 * @param {string} password - The plaintext password to hash and store.
 * @param {function} callback - TODO: This will probably change depending on suggested changes to db.addNewUser.
 */
function register(user, password, callback) {
    // Asynchronously hash the password with bcrypt.
    return bcrypt.hash(password, null, null, function(e, hash) {
        if (e) {
            console.log('Failed to hash password.');
            console.log(e);
            return callback(e);
        } else {
            var vhash = util.getRandomHash();
            return db.addNewUser(user, hash, vhash, function(err, u){
                if(err) {
                    console.log('database enter user fail');
                    console.log(err);
                    return callback(err);
                } else {
                    // if (dbCFG.database !== 'felinaTest') {
                    var mailOptions = {
                        from: smtp_config.auth.email,
                        to: u.email,
                        subject: "Validate email for Felina",
                        text: 'Copy and paste this link in your browser to validate: '+host+'/validate/'+encodeURIComponent(u.email)+'/'+encodeURIComponent(vhash)
                    };
                    transport.sendMail(mailOptions);
                    // }
                    return callback(null, u);
                }
            });
        }
    });
}


/**
 * Registers a new subuser with email/password authentication. Will send an email verification to the user's email address.
 * @param {user.User} user - The subuser to create. The id and privilege level will be overwritten. Subuser properties must be set.
 * @param {string} password - The plaintext password to hash and store.
 * @param {userCallback} callback - The callback that provides the new user object.
 */
function registerSub(user, password, callback) {
    return bcrypt.hash(password, null, null, function(e, hash) {
        if (e) {
            console.log(e);
            return callback(e);
        } else {
            return db.addNewSub(user, hash, function(err, u) {
                if(err) {
                    console.log(err);
                    return callback(err);
                } else {
                    return callback(null, u);
                }
            });
        }
    });
}

/**
 * Login callback as defined by Passport-Local. See {@link https://github.com/jaredhanson/passport-local}.
 * @callback passportLocalVerifyCallback
 * @param {?Error} err - The error that occurred, if present.
 * @param {user.User|boolean} user - The user object to assign to the requester's session, or boolean false if login details were incorrect.
 */

/**
 * Verifies a login attempt. To be supplied to Passport-Local to implement local login logic.
 * @param {string} username - The username according to Passport. (The email address in our implementation).
 * @param {string} password - The paintext password the user has tried to login with.
 * @param {passportLocalVerifyCallback} done - The callback supplied by Passport-Local.
 */
function localVerify(username, password, done) {
    console.log("Verifying user: " + username);
    var passHash = db.getUserHash(username, function(err, user, hash) {
        if (err) {
            console.log(err);
            return done(err, null);
        } else if (user === null || hash === null) {
            return done(null, false);
        } else {
            return bcrypt.compare(password, hash, function(hErr, correct) {
                if (hErr) {
                    return done(hErr, null);
                } else if (correct) {
                    return done(null, user);
                } else {
                    return done(null, false);
                }
            });
        }
    });
}

/**
 * Defines what the keys of the username and password fields Passport-Local accepts should be.
 */
var STRATEGY_OPTIONS = Object.freeze({
    usernameField: 'email',
    passwordField: 'pass'
});

/**
 * Instantiation of the Passport LocalStrategy, using the options defined in this module.
 */
var BcryptLocalStrategy = new LocalStrategy(STRATEGY_OPTIONS, localVerify);

/***
 ** API ROUTE FUNCTIONS
 **/

/**
 * API endpoint to register a new user with email/password authentication.
 * @hbcsapi {POST} /user - This is an API endpoint.
 * @param {string} email - The new user's email.
 * @param {string} pass - The plaintext password of the new user.
 * @param {string} name - The new user's display name.
 * @param {string} [gravatar] - The hash of the new user's gravatar email.
 * @returns {UserAPIResponse} The API response that details the newly created user.
 */
function postUser(req, res) {
    if (req.body.email && req.body.pass) {
        var mail = req.body.email;
        var name = req.body.name;
        var pass = req.body.pass;
        var priv = User.prototype.Type.USER.i;
        var grav = req.body.gravatar;
        var user = new User(-1, name, mail, priv, grav);
        if (user.id === false) {
            // Details of user are invalid.
            return res.send(new errors.APIErrResp(1, 'User details are invalid!'));
        } else {
            return register(user, pass, function(err, newU) {
                if (err) {
                    // Registration failed, notify api.
                    console.log('Registration failed:');
                    console.log(err);
                    return res.send(new errors.APIErrResp(2, 'Registration failed.'));
                } else {
                    // Make sure we don't accidentally refer to an old object.
                    user = newU;
                    console.log(['Registered user:',user.id,mail,name,priv,grav].join(" "));
                    // Login the newly registered user.
                    return req.login(user, function(err) {
                        if (err) {
                            // Login failed for some reason.
                            console.log('Post registration login failed:');
                            console.log(err);
                            return res.send(new errors.APIErrResp(3, 'Registration success but login failed.'));
                        } else {
                            return res.send({
                                'res': true,
                                'user': user
                            });
                        }
                    });
                }
            });
        }
    } else {
        return res.send(new errors.APIErrResp(4, 'Invalid request.'));
    }
}

/**
 * API endpoint to register a new subuser. The password will be randomly generated. The supervisor will be set
 * to the currently logged in user.
 * @hbcsapi {POST} /subusers - This is an API endpoint.
 * @param {string} email - The new user's email.
 * @param {string} name - The new user's display name.
 * @param {number} projectid - The project id to assign the subuser to.
 * @param {string} [gravatar] - The hash of the new user's gravatar email.
 * @returns {UserAPIResponse} The API response that details the newly created user.
 */
function postSubusers(req, res) {
    var mail = req.body.email;
    var name = req.body.name;
    var pass = util.getRandomHash();
    var priv = User.prototype.Type.SUBUSER.i;
    var grav = req.body.gravatar;
    var proj = parseInt(req.body.projectid);
    var user = new User(-1, name, mail, priv, grav, req.user.id, proj);
    
    if (user.id === false) {
        // Details of user are invalid.
        return res.send(new errors.APIErrResp(2, 'User details are invalid!'));
    } else {
        return registerSub(user, pass, function(err, u) {
            if (err) {
                // Registration failed, notify api.
                console.log('Registration failed:');
                console.log(err);
                return res.send(new errors.APIErrResp(3, 'Registration failed.'));
            } else {
                return res.send({
                    'res': true,
                    'user': u
                });
            }
        });
    }
}

/**
 * API endpoint to login the user. Note that this endpoint optionally accepts form-encoded data, as well as JSON.
 * @hbcsapi {POST} /login - This is an API endpoint.
 * @param {string} email - The user's email.
 * @param {string} pass - The user's plaintext password.
 * @returns {UserAPIResponse} The API response detailing the user that has been logged in.
 */
function postLogin(req, res, next) {
    passport.authenticate('local', function(err, user, info) {
        if (err) {
            console.log(err);
            return res.send(new errors.APIErrResp(2, 'Internal server error.'));
        } else if (!user) {
            return res.send(new errors.APIErrResp(1, 'Email or password incorrect!'));
        } else {
            return req.logIn(user, function(err) {
                if (err) {
                    console.log(err);
                    return res.send(new errors.APIErrResp(2, 'Internal server error.'));
                } else {
                    return res.send({
                        'res': true,
                        'user': user
                    });
                }
            });
        }
    })(req, res, next);
}

/**
 * @typedef SubuserTokenAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the token has not yet expired and has not yet been retrieved.
 * @property {APIError} [err] - The error that occurred, including token expiry.
 * @property {string} [token] - The auth token/password.
 */

/**
 * API endpoint to retrieve the subuser's authentication details. May only be accessed once during a limited
 * timespan after the supervisor has enabled this action.
 * @hbcsapi {POST} /token - This is an API endpoint.
 * @param {string} email - The user's email.
 * @returns {SubuserTokenAPIResponse} The API response detailing the subuser's auth token.
 */
function postToken(req, res) {
    var email = req.body.email;
    if (email) {
        console.log(email);
        return db.tokenExpiry(email, function(err, info) {
            if (err) {
                console.log(err);
                return res.send(new errors.APIErrResp(2, "database error"));
            } else if (info) {
                var token = util.getRandomHash();
                return util.newToken(email, token, function(e,r) {
                    if (e) {
                        return res.send(new errors.APIErrResp(2, "database error"));
                    } else if (r) {
                        return res.send({
                            'res': true,
                            'token': token
                        });
                    } else {
                        return res.send(new errors.APIErrResp(3, "invalid email"));
                    }
                });
            } else {
                return res.send(new errors.APIErrResp(3, "token expired"));
            }
        }); 
    } else {
        return res.send(new errors.APIErrResp(3, "email not set"));
    }
}

/**
 * API endpoint that verifies a user's email by checking the random token sent to them.
 * @hbcsapi {GET} validate/:email/:hash - This is an API endpoint.
 * @param {string} :email - The email to verify.
 * @param {string} :hash - The verification hash.
 * @returns {BasicAPIResponse} - The API response that signifies whether the hash matches the one we were expecting.
 */
function getValidateIdId(req, res) {
    var email = req.params.email;
    var hash = req.params.hash;
    if (hash.length === 32) {
        return db.validateEmail(email, hash, function(err, info){
            if (err) {
                console.log(err);
                return res.send(new errors.APIErrResp(1, 'Validation failed'));
            } else if (info) {
                return res.send({
                    'res': true
                });
            } else {
                return res.send(new errors.APIErrResp(2, 'Invalid URL.'));
            }
        });
    } else {
        return res.send(new errors.APIErrResp(2, 'Invalid URL.'));
    }
}

/**
 * Registers Express routes related to local (email/password) authentication. These are API endpoints.
 * @static
 * @param {Express} app - The Express application object.
 * @param {object} auth - The auth module.
 */
function authRoutes(app, enforceLogin) {
    app.post('/user', postUser);
    app.post('/subusers', enforceLogin({'minPL':'researcher'}), postSubusers);
    app.post('/login', require('express').urlencoded(), postLogin);
    app.post('/token', postToken);
    app.get('/validate/:email/:hash', getValidateIdId);
}

// Export all public members.
module.exports = {
    LocalStrategy:BcryptLocalStrategy,
    register:register,
    authRoutes:authRoutes
};

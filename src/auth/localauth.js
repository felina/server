/**
 * @module localauth
 */

var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var db = require('../db.js');
var users = require('../user.js');
var errors = require('../error.js');
var nodemailer = require('nodemailer');
var crypto = require('crypto');
var bcrypt = require('bcrypt-nodejs');

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

// TODO: I'm the same method from user.js. Remove me!
function getValidationHash() {
    var md5 = crypto.createHash('md5');
    var str = '';
    var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (var i=0; i<=10; i++) {
        str += chars[Math.round(Math.random() * (chars.length - 1))];
    }
    md5.update(str);
    return md5.digest('hex');
}

// Possible duplicate in user.js? TODO: Remove me?
function newToken(email, password, callback) {
    bcrypt.hash(password, null, null, function(err, hash) {
        if (err) {
            console.log('Failed to hash password');
            console.log(err);
            callback(err, null);
        } else {
            db.updateUserHash(email, hash, 1, function(e, r) {
                if (e) {
                    console.log('database error');
                    console.log(e);
                    callback(e, null);
                } else {
                    callback(null, r);
                }
            });
        }
    });
}

/**
 * Registers a new user with email/password authentication. Will send an email verification to the user's email address.
 * @static
 * @param {user.User} user - The user to create. The id and privilege level will be overwritten.
 * @param {string} password - The plaintext password to hash and store.
 * @param {function} callback - TODO: This will probably change depending on suggested changes to db.addNewUser.
 */
function register(user, password, callback) {
    // Asynchronously hash the password with bcrypt.
    bcrypt.hash(password, null, null, function(e, hash) {
        if (e) {
            console.log('Failed to hash password.');
            console.log(e);
            callback(e, null);
        } else {
            var vhash = getValidationHash();
            db.addNewUser(user, hash, vhash, function(err, id){
                if(err) {
                    console.log('database enter user fail');
                    console.log(err);
                    callback(err, null);
                } else {
                    // if (dbCFG.database !== 'felinaTest') {
                        var mailOptions = {
                            from: smtp_config.auth.email,
                            to: user.email,
                            subject: "Validate email for Felina",
                            text: 'Copy and paste this link in your browser to validate: '+host+'/validate/'+vhash
                        };
                        transport.sendMail(mailOptions);
                    // }
                    return callback(null, id);
                }
            });
        }
    });
}


/**
 * Registers a new subuser with email/password authentication. Will send an email verification to the user's email address.
 * @param {user.User} user - The subuser to create. The id and privilege level will be overwritten. Subuser properties must be set.
 * @param {string} password - The plaintext password to hash and store.
 * @param {function} callback - TODO: This will probably change depending on suggested changes to db.addNewUser.
 */
function registerSub(user, password, callback) {
    bcrypt.hash(password, null, null, function(e, hash) {
        if (e) {
            console.log('Failed to hash password.');
            console.log(e);
            callback(e, null);
        } else {
            db.addNewSub(user, hash, function(err, id){
                if(err) {
                    console.log('database enter user fail');
                    console.log(err);
                    callback(err, null);
                } else {
                    return callback(null, id);
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
            return done(null, false);//, JSON.stringify({res:false, err:{code:1, msg: 'Unregistered user.'}}));
            // return done(JSON.stringify({res:false, err:{code:1, msg: 'Unregistered user.'}}), false);//, JSON.stringify({res:false, err:{code:1, msg: 'Unregistered user.'}}));
        } else {
            bcrypt.compare(password, hash, function(hErr, correct) {
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

/**
 * Registers Express routes related to local (email/password) authentication. These are API endpoints.
 * @static
 * @param {Express} app - The Express application object.
 * @param {auth/auth.enforceLogin} enfoceLogin - The enfoceLogin middleware. TODO: WHY???
 */
function authRoutes(app, enforceLogin) {
    /**
     * API endpoint to register a new user with email/password authentication.
     * @hbcsapi {POST} register - This is an API endpoint.
     * @param {string} email - The new user's email.
     * @param {string} pass - The plaintext password of the new user.
     * @param {string} name - The new user's display name.
     * @param {string} [gravatar] - The hash of the new user's gravatar email.
     * @returns {UserAPIResponse} The API response that details the newly created user.
     */
    app.post('/register', function(req, res) {
        if (req.body.email && req.body.pass) {
            var mail = req.body.email;
            var name = req.body.name;
            var pass = req.body.pass;
            var priv = users.PrivilegeLevel.USER.i;
            var grav = req.body.gravatar;
            var user = new users.User(-1, name, mail, priv, grav);
            if (user.id === false) {
                // Details of user are invalid.
                res.send(new errors.APIErrResp(1, 'User details are invalid!'));
            } else {
                register(user, pass, function(err, id) {
                    if (err) {
                        // Registration failed, notify api.
                        console.log('Registration failed:');
                        console.log(err);
                        return res.send(new errors.APIErrResp(2, 'Registration failed.'));
                    } else {
                        // Update id from DB insertion.
                        user.id = id;
                        console.log(['Registered user:',id,mail,name,priv,grav].join(" "));
                        // Login the newly registered user.
                        return req.login(user, function(err) {
                            if (err) {
                                // Login failed for some reason.
                                console.log('Post registration login failed:');
                                console.log(err);
                                return res.send(new errors.APIErrResp(3, 'Registration success but login failed.'));
                            } else {
                                return res.send({
                                    'res':true,
                                    'user':user
                                });
                            }
                        });
                    }
                });
            }
        } else {
            res.send(new errors.APIErrResp(4, 'Invalid request.'));
        }
    });

    /**
     * API endpoint to register a new subuser. The password will be randomly generated. The supervisor will be set
     * to the currently logged in user.
     * @hbcsapi {POST} subuser - This is an API endpoint.
     * @param {string} email - The new user's email.
     * @param {string} name - The new user's display name.
     * @param {number} projectid - The project id to assign the subuser to.
     * @param {string} [gravatar] - The hash of the new user's gravatar email.
     * @returns {UserAPIResponse} The API response that details the newly created user.
     */
    app.post('/subuser', enforceLogin({'minPL':2}), function(req, res) {
        var mail = req.body.email;
        var name = req.body.name;
        var pass = getValidationHash();
        var priv = users.PrivilegeLevel.SUBUSER.i;
        var grav = req.body.gravatar;
        var proj = parseInt(req.body.projectid);
        var user = new users.User(-1, name, mail, priv, grav, req.user.id, proj);
        
        if (req.user.privilege < users.PrivilegeLevel.RESEARCHER.i) {
          res.send(new errors.APIErrResp(2, 'Insufficient privilege'));
        }
        
        if (user.id === false) {
            // Details of user are invalid.
            res.send(new errors.APIErrResp(2, 'User details are invalid!'));
        } else {
            registerSub(user, pass, function(err, id) {
                if (err) {
                    // Registration failed, notify api.
                    console.log('Registration failed:');
                    console.log(err);
                    res.send(new errors.APIErrResp(3, 'Registration failed.'));
                } else {
                    // Update id from DB insertion.
                    user.id = id;
                    console.log(['Registered subuser:',id,mail,pass,name,priv,grav,proj].join(" "));                        
                    res.send({
                        'res':true,
                        'user':user
                    });
                }
            });
        }
    });

    /**
     * API endpoint to login the user. Note that this endpoint optionally accepts form-encoded data, as well as JSON.
     * @hbcsapi {POST} login - This is an API endpoint.
     * @param {string} email - The user's email.
     * @param {string} pass - The user's plaintext password.
     * @returns {UserAPIResponse} The API response detailing the user that has been logged in.
     */
    app.post('/login', require('express').urlencoded(), function(req, res, next) {
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
    });

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
     * @hbcsapi {GET} token - This is an API endpoint.
     * @param {string} email - The user's email.
     * @returns {SubuserTokenAPIResponse} The API response detailing the subuser's auth token.
     */
    app.get('/token', function(req, res) {
        var email = req.query.email;
        if (email) {
            console.log(email);
            db.tokenExpiry(email, function(err, info) {
                if (err) {
                    console.log(err);
                    return res.send(new errors.APIErrResp(2, "database error"));
                } else if (info) {
                    var token = getValidationHash();
                    newToken(email, token, function(e,r) {
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
    });

    /**
     * API endpoint that verifies a user's email by checking the random token sent to them.
     * @hbcsapi {GET} validate/:hash - This is an API endpoint.
     * @param {string} :hash - The verification hash.
     * @returns {BasicAPIResponse} - The API response that signifies whether the hash matches the one we were expecting.
     */
    app.get('/validate/:hash', function(req, res) {
        var hash = req.params.hash;
        if (hash.length === 32) {
            db.validateEmail(hash, function(err, info){
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
    });
}

// Export all public members.
module.exports = {
    getValidationHash:getValidationHash,
    LocalStrategy:BcryptLocalStrategy,
    register:register,
    authRoutes:authRoutes
};

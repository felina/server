var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var db = require('../db.js');
var users = require('../user.js');
var errors = require('../error.js');
var nodemailer = require('nodemailer');
var smtp_config = require('../../config/smtp.json');
var crypto = require('crypto');
var bcrypt = require('bcrypt-nodejs');
var transport = nodemailer.createTransport("SMTP", smtp_config);
var host= (process.env.HOST||'nl.ks07.co.uk')+':'+(process.env.PORT || 5000);

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

function register(user, password, callback) {
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
                    var mailOptions = {
                        from: smtp_config.auth.email,
                        to: user.email,
                        subject: "Validate email for Felina",
                        text: 'Copy and paste this link in your browser to validate: '+host+'/validate/'+vhash
                    };
                    transport.sendMail(mailOptions);
                    return callback(null, id);
                }
            });
        }
    });
}

function registerSub(user, password, supervisor, callback) {
    bcrypt.hash(password, null, null, function(e, hash) {
        if (e) {
            console.log('Failed to hash password.');
            console.log(e);
            callback(e, null);
        } else {
            db.addNewSub(user, hash, supervisor, function(err, id){
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

function compare(pass, hash) {
        return bcrypt.compareSync(pass, hash);
}

function localVerify(username, password, done) {
    console.log("Verifying user: " + username);
    var passHash = db.getUserHash(username, function(err, user, hash) {
        if (err) {
            console.log(err);
            return done(err, null);
        } else if (user === null || hash === null) {
            return done('Unregistered user.', null);
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

var StrategyOptions = Object.freeze({
    usernameField: 'email',
    passwordField: 'pass'
});

var BcryptLocalStrategy = new LocalStrategy(StrategyOptions, localVerify);

function authRoutes(app) {
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
                res.send({'res':false, 'err':{'code':1, 'msg':'User details are invalid!'}});
            } else {
                register(user, pass, function(err, id) {
                    if (err) {
                        // Registration failed, notify api.
                        console.log('Registration failed:');
                        console.log(err);
                        res.send({'res':false, 'err':{'code':2, 'msg':'Registration failed.'}});
                    } else {
                        // Update id from DB insertion.
                        user.id = id;
                        console.log(['Registered user:',id,mail,pass,name,priv,grav].join(" "));
                        res.send({'res':true, 'user':user});
                        // Login the newly registered user.
                        req.login(user, function(err) {
                            if (err) {
                                // Login failed for some reason.
                                console.log('Post registration login failed:');
                                console.log(err);
                            }
                        });
                    }
                });
            }
        } else {
            res.send({'res':false, 'err':{'code':3, 'msg':'Invalid request.'}});
        }
    });

    app.post('/subuser', function(req, res) {
        if(!req.user) {
            return res.send({'res':false, 'err':{'code':1, 'msg':'You must be logged in to access this feature.'}});
        }
        if (req.user.privilege > 1) {
            var mail = req.body.email;
            var name = req.body.name;
            var pass = getValidationHash();
            var priv = users.PrivilegeLevel.SUBUSER.i;
            var grav = req.body.gravatar;
            var user = new users.User(-1, name, mail, priv, grav);
            if (user.id === false) {
                // Details of user are invalid.
                res.send({'res':false, 'err':{'code':1, 'msg':'User details are invalid!'}});
            } else {
                registerSub(user, pass, req.user.id, function(err, id) {
                    if (err) {
                        // Registration failed, notify api.
                        console.log('Registration failed:');
                        console.log(err);
                        res.send({'res':false, 'err':{'code':2, 'msg':'Registration failed.'}});
                    } else {
                        // Update id from DB insertion.
                        user.id = id;
                        console.log(['Registered user:',id,mail,pass,name,priv,grav].join(" "));                        
                        res.send({'res':true, 'user':user});
                    }
                });
            }
        } else {
            res.send({'res':false, 'err':{'code':2, 'msg':'Insufficient Privilege.'}});
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

    // Give the subuser a token 
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
                        if(e) {
                            return res.send(new errors.APIErrResp(2, "database error"));
                        } else if (r) {
                            return res.send({'res': true, 'token': token});
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

    // validation callback for email validation
    app.get('/validate/:hash', function(req, res) {
        var hash = req.params.hash;
        if(hash.length === 32) {
            db.validateEmail(hash, function(err, info){
                if(err) {
                    console.log(err);
                    res.send({'res':false, 'err':{'code':1, 'msg':'validation failed'}});
                } else if(info) {
                    res.send({'res':true, 'msg':'Validation successfull'});
                } else {
                    return res.send({'res':false, 'err':{'code':1, 'msg':'invalid url'}});
                }
            });
        } else {
            return res.send({'res':false, 'err':{'code':1, 'msg':'invalid url'}});
        }

    });
}

module.exports = {
    LocalStrategy:BcryptLocalStrategy,
    register:register, 
    compare:compare, 
    authRoutes:authRoutes
};

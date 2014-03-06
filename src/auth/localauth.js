var bcrypt = require('bcrypt-nodejs');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var db = require('../db.js');
var users = require('../user.js');
var nodemailer = require('nodemailer');
var smtp_config = require('../../config/smtp.json');
var crypto = require('crypto');
var md5 = crypto.createHash('md5');
var transport = nodemailer.createTransport("SMTP", smtp_config);
var host= (process.env.HOST||'nl.ks07.co.uk')+':'+(process.env.PORT || 5000);
// callback(err, id)

function sendValidation(email, id, callback) {
    var str = '';
    var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (var i=0; i<=10; i++)
        str += chars[Math.round(Math.random() * (chars.length - 1))];
    md5.update(str);
    var hash = md5.digest('hex');
    console.log(str);
    console.log('hash: '+hash);
    console.log('host: '+host+' email: '+ JSON.stringify(email));
    var mailOptions = {
        from: smtp_config.auth.email,
        to: email,
        subject: "Validate email for Felina",
        text: '<a src="'+host+'/validate/'+hash+'>Click Here to Validate.</a>'
    }
    transport.sendMail(mailOptions);
    
    callback(null, id);
}

function register(user, password, callback) {
    bcrypt.hash(password, null, null, function(err, hash) {
	if (err) {
	    console.log('Failed to hash password.');
	    console.log(err);
	    callback(err, null);
	} else {
	    db.addNewUser(user, hash, function(err, id){
                if(err) {
                    console.log('database enter user fail');
                    console.log(err);
                    callback(err, null);
                } else {
                    sendValidation(user.email, id,  callback); 
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
				console.log('Post registration login failed:')
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
}

module.exports = {LocalStrategy:BcryptLocalStrategy, register:register, compare:compare, authRoutes:authRoutes};
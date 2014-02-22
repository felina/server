var bcrypt = require('bcrypt-nodejs');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var db = require('../db.js');
var users = require('../user.js');

// callback(err, id)
function register(user, password, callback) {
    db.addNewUser(user, bcrypt.hashSync(password), callback);
}

function compare(pass, hash) {
	return bcrypt.compareSync(pass, hash);
}

function localVerify(username, password, done) {
	console.log("Verifying user: " + username + " " + password);
	var passHash = db.checkUserHash(username, password, done);
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
	    var user = new users.User(-1, name, mail, priv);
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
			console.log(['Registered user:',id,mail,pass,name,priv].join(" "));
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

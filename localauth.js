var bcrypt = require('bcrypt-nodejs');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var db = require('./db.js');

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

module.exports = {LocalStrategy:BcryptLocalStrategy, register:register, compare:compare};

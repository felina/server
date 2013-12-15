var bcrypt = require('bcrypt-nodejs');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
//var userstable = [
//    {id: 1, username: 'bob', password: 'secret', email: 'bob@example.com' },
//    {id: 2, username: 'fred', password: 'birthday', email: 'fred@example.com'}
//];
var db = require('./db.js');

/*
function findByUsername(username, fn) {
    for (var i = 0, len = userstable.length; i < len; i++) {
        var user = userstable[i];
        if (user.username == username) {
            return fn(user.password);
        }
    }
    return fn(null);
}

passport.use(new LocalStrategy(
    function(username, password, done) {
        // var passHash = bcrypt.hash(password, email, null, function(err, hash))
        var passHash = findByUsername(username, bcrypt.hashSync());
        // bcrypt.compare(password, passHash, function(err, res));
        bcrypt.compareSync(password, passHash);
    })
);
*/

function register(email, password) {
	db.addNewUser(email, 1, bcrypt.hashSync(password));
}

function compare(pass, hash) {
	return bcrypt.compareSync(pass, hash);
}

function localVerify(username, password, done) {
	console.log("Verifying user: " + username + " " + password);
	var passHash = db.checkUserHash(username, password, done);
	/*console.log("bfjdsk " + password + " " + passHash);
	var correct = bcrypt.compareSync(password, passHash); //TODO: Async?
	console.log("Check, check");
	
	if (correct) {
		return done(null, {"username": "LOGGED IN"});
	} else {
		return done(null, false);
	}*/
}

var BcryptLocalStrategy = new LocalStrategy(localVerify);

module.exports.LocalStrategy = BcryptLocalStrategy;
module.exports.register = register;
module.exports.compare = compare;

// console.log(testPass("bob", "secret"));
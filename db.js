var mysql = require('mysql');
var dbCFG = require('./dbSettings.json');
var bcrypt = require('bcrypt-nodejs');
var conn = mysql.createConnection(dbCFG);

function init() {
	conn.connect(function(err) {
		if (err) {
			console.log(err.code);
				console.log(err.fatal);
		} else {
			console.log("DB connected.");
		}
		});
}

init();

// Adds a new user to users/local auth. TODO: Use a user object.
function addNewUser(email, privilege, auth) {
	var query = "INSERT INTO `users` VALUE (null,?,?)"
	var sub = [email, privilege];
	query = mysql.format(query, sub);
	conn.query(query, function(err, res) {
		if (err) {
			console.log(err.code);
			return false;
		} else {
			return setUserHash(res.insertId, auth);
		}
	});
}

function setUserHash(id, auth) {
	var query = "INSERT INTO `local_auth` VALUE (?,?)";
	var sub = [id, auth];
	query = mysql.format(query, sub);
	conn.query(query, function(err, res) {
		if (err) {
			// The query failed, respond to the error.
			console.log(err.code);
			return false;
		} else {
			console.log(res);
			return true;
		}
	});
}

// Looks up a users bcrypt hash from their registered email, compare pass, and give results to callback.
// callback(err/null, user/false, info)
function checkUserHash(email, pass, callback) {
	var query = "SELECT `hash` FROM `local_auth` INNER JOIN `users` USING (`userid`) WHERE `email` = ?";
	var sub = [email];
	query = mysql.format(query, sub);
	conn.query(query, function(err, res) {
		if (err) {
			// The query failed, respond to the error.
			callback(err);
		} else {
			if (res.length === 0) {
				callback(null, false, { message: "Not registered." });
			} else if (bcrypt.compareSync(pass, res[0].hash)) {
				callback(null, {username: 'some user', id: 123});
			} else {
				callback(null, false, { message: "Incorrect password." });
			}
		}
	});
}

module.exports.init = init;
module.exports.checkUserHash = checkUserHash;
module.exports.addNewUser = addNewUser;
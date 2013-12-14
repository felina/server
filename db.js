var mysql = require('mysql');
var dbCFG = require('./dbSettings.json');

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

// Looks up a users bcrypt hash from their registered email	
function getUserHash(email) {
	var query = "SELECT `hash` FROM `local_auth` INNER JOIN `users` USING (`userid`) WHERE `email` = ?";
	var sub = [email];
	query = mysql.format(query, sub);
	conn.query(query, function(err, res) {
		if (err) {
			// The query failed, respond to the error.
			console.log(err.code);
		} else {
			console.log(res);
			return res;
		}
	});
}

module.exports.init = init;
module.exports.getUserHash = getUserHash;
module.exports.addNewUser = addNewUser;
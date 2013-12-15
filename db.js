var mysql = require('mysql');
var dbCFG = require('./db_settings.json');
var bcrypt = require('bcrypt-nodejs');
var users = require('./user.js');
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
function addNewUser(user, phash) {
	var query = "INSERT INTO `users` VALUE (null,?,?,?)"
	var sub = [user.email, user.name, "user"];
	query = mysql.format(query, sub);
	conn.query(query, function(err, res) {
		if (err) {
			console.log(err.code);
		} else {
			setUserHash(res.insertId, phash);
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
		}
	});
}

// Looks up a users bcrypt hash from their registered email, compare pass, and give results to callback.
// callback(err/null, user/false, info)
function checkUserHash(email, pass, callback) {
	var query = "SELECT `users`.`userid`, `name`, `email`, `hash`, `usertype` "
              + "FROM `local_auth` "
              + "INNER JOIN `users` USING (`userid`) "
              + "WHERE `email` = ?";
	var sub = [email];
	query = mysql.format(query, sub);
	conn.query(query, function(err, res) {
		if (err) {
			// The query failed, respond to the error.
			callback(err);
		} else {
			if (res.length == 0) {
				callback(null, false, { message: "Not registered." });
			} else {
                var details = res[0];
                if (bcrypt.compareSync(pass, details.hash)) {
                    console.log(details);
                    var user = new users.User(details.userid, details.name. details.email, users.privilegeFromString(details.usertype));
                    console.log("Login OK");
                    callback(null, user);
                } else {
                    callback(null, false, { message: "Incorrect password." });
                }
            }
		}
	});
}

module.exports = {init:init, checkUserHash:checkUserHash, addNewUser:addNewUser};

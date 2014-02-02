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

// Attempts to deserialize a user, passing it to the done callback.
// done(err, user)
function getUser(id, done) {
    var query = "SELECT `email`, `name`, `usertype` "
        + "FROM `users` "
        + "WHERE `userid` = ?";
    var sub = [id];
    query = mysql.format(query, sub);
    conn.query(query, function(err, res) {
	console.log("QUERIED USER");
	if (err) {
	    // The query failed, respond to the error.
	    done(err, null);
	} else {
	    if (res.length == 0) {
		done(null, false);
	    } else {
                var user = new users.User(id, res[0].name, res[0].email, users.privilegeFromString(res[0].usertype));
                done(null, user);
            }
	}
    });
}

// Adds a new user to users/local auth. TODO: Use a user object.
// callbaack(err, id)
function addNewUser(user, phash, callback) {
    var query = "INSERT INTO `users` VALUE (null,?,?,?)"
    var sub = [user.email, user.name, "user"];
    query = mysql.format(query, sub);
    conn.query(query, function(err, res) {
	if (err) {
	    console.log(err.code);
	    callback(err, null);
	} else {
	    setUserHash(res.insertId, phash);
	    callback(null, res.insertId);
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
			} else if (bcrypt.compareSync(pass, res[0].hash)) {
                var user = new users.User(res[0].userid, res[0].name, res[0].email, users.privilegeFromString(res[0].usertype));
                callback(null, user);
            } else {
                callback(null, false, { message: "Incorrect password." });
            }
		}
	});
}

module.exports = {init:init, checkUserHash:checkUserHash, addNewUser:addNewUser, getUser:getUser};

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

// Checks eligibility to load an image.
function checkImagePerm(user, id, callback) {
    var query = "SELECT (`ownerid`=? OR NOT `private`) AS 'open' FROM `images` WHERE `imageid`=?";
    var sub = [user.id, id];
    query = mysql.format(query, sub);
    conn.query(query, function(err, res) {
	if (err) {
	    console.log(err.code);
	    callback(err, false);
	} else if (res.length === 0) {
	    callback(null, false);
	} else {
	    callback(null, res[0].open);
	}
    }); 
}

// Returns a list of all images uploaded by a user.
function getUserImages(user, callback) {
    var query = "SELECT `imageid` FROM `images` WHERE `ownerid`=?";
    var sub = [user.id];
    query = mysql.format(query, sub);
    conn.query(query, function(err, res) {
	if (err) {
	    console.log(err.code);
	    callback(err, null);
	} else {
	    callback(null, res);
	}
    });
}

// Adds a new image to the database.
function addNewImage(user, project, image) {
    var query = "INSERT INTO `images` (imageid, ownerid, projectid) VALUE (?,?,?)";
    var sub = [image.imageHash, user.id, project.id];
    query = mysql.format(query, sub);
    conn.query(query, function(err, res) {
	if (err) {
	    console.log(err.code);
	    //callback(err, null);
	} else {
	    console.log('Inserted image into db.');
	    //callback(null, res.insertId);
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

// Attempts to deserialize a user, passing it to the done callback.
// done(err, user)
function extGetUser(id, provider, loginUser, done) {
    var query = "SELECT `users`.`userid`, `email`, `name`, `usertype` "
        + "FROM `users` "
	+ "INNER JOIN `ext_auth` USING (`userid`) "
        + "WHERE `provider` = ? AND `service_id` = ?";
    var sub = [provider, id];
    query = mysql.format(query, sub);
    console.log(query);
    conn.query(query, function(err, res) {
	if (err) {
	    // The query failed, respond to the error.
	    console.log(err.code);
	    done(err, null);
	} else {
	    if (res.length == 0) {
		console.log('New ext auth user.');
		if (loginUser) {
		    // User is already logged in, join the accounts.
		    extAssocUser(id, provider, loginUser, done);
		} else {
		    // User is not logged in and account does not exist.
		    done(null, false);
		}
	    } else {
                var user = new users.User(res[0].userid, res[0].name, res[0].email, users.privilegeFromString(res[0].usertype));
                done(null, user);
            }
	}
    });
}

// Associates an external auth account with a user.
function extAssocUser(id, provider, loginUser, done) {
    var query = "INSERT INTO `ext_auth` VALUE (?,?,?)";
    var sub = [loginUser.id, provider, id];
    query = mysql.format(query, sub);
    console.log(query);
    conn.query(query, function(err, res) {
	if (err) {
	    // The query failed, respond to the error.
	    console.log(err.code);
	    done(err, null);
	} else {
	    done(null, loginUser);
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

module.exports = {init:init, checkUserHash:checkUserHash, addNewUser:addNewUser, getUser:getUser, extGetUser:extGetUser, addNewImage:addNewImage, getUserImages:getUserImages, checkImagePerm:checkImagePerm};

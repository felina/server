var mysql = require('mysql');
var dbCFG = require('./dbSettings.json');

var conn = mysql.createConnection(dbCFG);

function init() {
	conn.connect(function(err) {
		console.log(err.code);
		console.log(err.fatal);
		});
}

// Looks up a users bcrypt hash from their registered email	
var getUserHash = function (email) {
	var query = "SELECT `local_auth`.`hash` FROM `local_auth` INNER JOIN `users` ON `user_id` WHERE `users`.`email` == ??";
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
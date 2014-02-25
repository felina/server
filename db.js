var mysql = require('mysql');
var dbCFG = require('./db_settings.json');
var bcrypt = require('bcrypt-nodejs');
var users = require('./user.js');
var errors = require('./error.js');
var connPool = mysql.createPool(dbCFG);

function init(callback) {
    // Test connection parameters.
    connPool.getConnection(function(connErr, conn) {
	if (connErr) {
	    return callback(connErr);
	}

	conn.query('SELECT `userid`, `email`, `name`, `usertype` FROM `users` LIMIT 0', function(err, res) {
	    if (err) {
		return callback(err);
	    } else {
		return callback(null);
	    }
	});
    });
}

function geomWKTToPoints(WKT) {
    var parStart = WKT.lastIndexOf('(', 11);
    var parEnd = WKT.indexOf(')', 6);
    if (parStart < 0 || parEnd < 0 || parStart + 3 >= parEnd) {
	console.log('WKT has invalid start or end! ' + WKT);
	return false;
    } else {
	var paramGroups = WKT.substring(parStart + 1, parEnd).split(', ');
	var region = new Array(paramGroups.length);
	paramGroups.forEach(function(paramGroup, i) {
	    var params = paramGroup.split(' ');
	    if (params.length != 2) {
		console.log('WKT param group is invalid ' + paramGroup);
	    } else {
		region[i] = {'x': params[0], 'y': params[1]};
	    }
	});
	return region;
    }
}

function pointsToGeomWKT(region) {
    if (region.length === 1) {
	// A single point.
	return "POINT("+region[0].x+" "+region[0].y+")";
    } else if (region.length === 2) {
	// A simple line.
	return "LINESTRING("+region[0].x+" "+region[0].y+", "+region[1].x+" "+region[1].y+")";
    } else {
	// A polygon.
	var i;
	var wkt = "POLYGON((";
	for (i = 0; i < region.length - 1; i++) {
	    wkt += region[i].x+" "+region[i].y+", ";
	}
	wkt += region[i].x+" "+region[i].y+"))";
	return wkt;
    }
}

function condenseAnnotations(annotations) {
    // To make query generation simpler, we will create a condensed array of only valid regions.
    var cond = [];
    for (var i = 0; i < annotations.length; i++) {
	if (annotations[i] !== false) {
	    // This must contain a valid region, keep it.
	    cond.push(annotations[i]);
	}
    }
    return cond;
}

// Adds annotation to an image.
function addImageAnno(iid, annotations, callback) {
    var anno = condenseAnnotations(annotations);

    if (anno.length <= 0) {
	console.log('Tried to insert empty annotations list!');
	return callback('No valid annotations provided', false);
    } else {
	var query = "INSERT INTO `image_annotations` (imageid, region, tag) VALUES ";
	var sub = new Array(anno.length * 3);
	var i;
	for (i = 0; i < anno.length - 1; i++) {
	    query = query + "(?,GeomFromText(?),?),";
	    sub[i * 3] = iid;
	    sub[(i * 3) + 1] = pointsToGeomWKT(anno[i].region);
	    sub[(i * 3) + 2] = (anno[i].tag === false) ? null : anno[i].tag;
	}
	// Add the final record
	query = query + "(?,GeomFromText(?),?)";
	sub[i * 3] = iid;
	sub[(i * 3) + 1] = pointsToGeomWKT(anno[i].region);
	sub[(i * 3) + 2] = (anno[i].tag === false) ? null : anno[i].tag;

	query = mysql.format(query, sub);

	connPool.getConnection(function(connErr, conn) {
	    if (connErr) {
		return callback('Database error', false);
	    }
	    conn.query(query, function(err, res) {
		if (err) {
		    console.log(err.code);
		    callback(err, null);
		} else {
		    console.log('Inserted ' + anno.length + '/' + annotations.length + ' annotations into db.');
		    callback(null, res);
		}
	    });

	    conn.release();
	});
    }
}

function updateMetaR(mdArr, callback, rSet) {
    if (mdArr.length === 0) {
	// Reached the end, send to callback.
	return callback(rSet);
    }

    var first = true;
    var md = mdArr.shift();
    var query = "UPDATE `images` SET";
    var sub = [];

    if (md.datetime) {
	if (!first) {
	    query += ",";
	}
	query += " `datetime`=?";
	sub.push(md.datetime);
	first = false;
    }
    if (md.location) {
	if (!first) {
	    query += ",";
	}
	query += " `location`=PointFromText(?)";
	var point="POINT(" + md.location.lat + " " + md.location.lon + ")";
	sub.push(point);
	first = false;
    }
    if (typeof md.priv !== 'undefined' && md.priv !== null) {
	if (!first) {
	    query += ",";
	}
	query += " `private`=?";
	sub.push(md.priv);
	first = false;
    }

    query += " WHERE `imageid`=?";
    sub.push(md.id);

    if (!first) {
	// Not first, so we are updating at least one value.
	query = mysql.format(query, sub);

	connPool.getConnection(function(connErr, conn) {
	    if (connErr) {
		return callback(false);
	    }

	    return conn.query(query, function(e, r) {
		conn.release();

		if (e) {
		    console.log(e);
		    // false if any errors occured in either query.
		    rSet.push(false);
		} else if (md.annotations !== null && md.annotations.length > 0) {
		    return addImageAnno(md.id, md.annotations, function (e2, r2) {
			if (e2) {
			    console.log(e2);
			    rSet.push(false);
			} else {
			    rSet.push(true);
			}

			return updateMetaR(mdArr, callback, rSet);
		    });
		} else {
		    rSet.push(true);
		}
		
		return updateMetaR(mdArr, callback, rSet);
	    });
	});
    } else {
	console.log('Skipping entry with no meta.'); //TODO: anno support here
	rSet.push(false);
	return updateMetaR(mdArr, callback, rSet);
    }
}

// Updates image metadata TODO: Check privileges! TODO: Lists!!!
function addImageMeta(mdArr, callback) {
    return updateMetaR(mdArr, callback, []);
}

// Checks eligibility to load an image.
function checkImagePerm(user, id, callback) {
    var query = "SELECT (`ownerid`=? OR NOT `private`) AS 'open' FROM `images` WHERE `imageid`=?";
    var sub = [user.id, id];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
	if (connErr) {
	    return callback('Database error', false);
	}

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

	conn.release();
    });
}

function getMetaBasic(uid, iid, callback) {
    var query = "SELECT `datetime`, AsText(`location`) AS 'location', `private` FROM `images` WHERE `imageid`=? AND (`ownerid`=? OR NOT `private`)";
    var sub = [iid, uid];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
	if (connErr) {
	    return callback('Database error', false);
	}

	conn.query(query, function(err, res) {
	    if (err) {
		console.log(err.code);
		callback(err, null);
	    } else {
		if (res.length >= 0) {
		    if (res[0].location != null) {
			res[0].location = geomWKTToPoints(res[0].location);
		    }
		    callback(null, res[0]);
		} else {
		    callback(null, false);
		}
	    }
	});

	conn.release();
    });
}

function getAnnotations(uid, iid, callback) {
    var query = "SELECT `annoid` AS 'id', AsText(`region`) AS 'region', `tag` " +
	"FROM `image_annotations` " +
	"INNER JOIN `images` USING (`imageid`) " +
	"WHERE `imageid`=? AND (`images`.`ownerid`=? OR NOT `images`.`private`)";
    var sub = [iid, uid];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
	if (connErr) {
	    return callback('Database error', false);
	}

	conn.query(query, function(err, res) {
	    if (err) {
		console.log(err.code);
		callback(err, null);
	    } else {
		res.forEach(function(entry) {
		    entry.region = geomWKTToPoints(entry.region);
		});
		callback(null, res);
	    }
	});

	conn.release();
    });
}

// Returns a list of all images uploaded by a user.
function getUserImages(user, callback) {
    var query = "SELECT `imageid`, `datetime`, AsText(`location`) AS 'loc', `private` FROM `images` WHERE `ownerid`=?";
    var sub = [user.id];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
	if (connErr) {
	    return callback('Database error', false);
	}

	conn.query(query, function(err, res) {
	    if (err) {
		console.log(err.code);
		callback(err, null);
	    } else {
		callback(null, res);
	    }
	});

	conn.release();
    });
}

// Adds a new image to the database.
function addNewImage(user, project, image) {
    var query = "INSERT INTO `images` (imageid, ownerid, projectid) VALUE (?,?,?)";
    var sub = [image.imageHash, user.id, project.id];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
	if (connErr) {
	    return; //callback('Database error', false);
	}

	conn.query(query, function(err, res) {
	    if (err) {
		console.log(err.code);
		//callback(err, null);
	    } else {
		console.log('Inserted image into db.');
		//callback(null, res.insertId);
	    }
	});

	conn.release();
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

    connPool.getConnection(function(connErr, conn) {
	if (connErr) {
	    return callback('Database error', false);
	}

	conn.query(query, function(err, res) {
	    if (err) {
		// The query failed, respond to the error.
		done(err, false);
	    } else {
		if (res.length == 0) {
		    done(null, false);
		} else {
                    var user = new users.User(id, res[0].name, res[0].email, users.privilegeFromString(res[0].usertype));
		    if (user.id === false) {
			done('User settings invalid.', false);
		    } else {
			done(null, user);
		    }
		}
	    }
	});

	conn.release();
    });
}

// Attempts to get a user (initialise login) via an external provider
function extGetUser(id, provider, loginUser, done) {
    var query = "SELECT `users`.`userid`, `email`, `name`, `usertype` "
        + "FROM `users` "
	+ "INNER JOIN `ext_auth` USING (`userid`) "
        + "WHERE `provider` = ? AND `service_id` = ?";
    var sub = [provider, id];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
	if (connErr) {
	    return done('Database error', null);
	}

	conn.query(query, function(err, res) {
	    if (err) {
		// The query failed, respond to the error.
		console.log(err.code);
		done(err, null);
	    } else {
		console.log('Using ext auth.');
		if (loginUser) {
		    if (res.length >= 1 && loginUser.id === res[0].userid) {
			// We know this provider and we already have it linked to this account. Do nothing.
			done(0, loginUser);
		    } else if (res.length >= 1) {
			// We know this provider/id but it's associated with another account!
			console.log('Tried to join already associated external account to a different user!');
			var user = new users.User(res[0].userid, res[0].name, res[0].email, users.privilegeFromString(res[0].usertype));
			done(1, user);
		    } else {
			// User is already logged in, join the accounts.
			console.log('Associating new provider with existing account.');
			extAssocUser(id, provider, loginUser, done);
			done(2, loginUser);
		    }
		} else {
		    if (res.length === 0) {
			// User is not logged in and provider/id combo not recognised.
			// TODO: Register
			console.log('Not logged in not recognised.');
			done(3);
		    } else {
			// User not logged in, but we know these credentials
			console.log('Not logged in, known user.');
			var user = new users.User(res[0].userid, res[0].name, res[0].email, users.privilegeFromString(res[0].usertype));
			done(0, user);
		    }
		}
            }
	});

	conn.release();
    });
}

// Associates an external auth account with a user.
function extAssocUser(id, provider, loginUser, done) {
    var query = "INSERT INTO `ext_auth` VALUE (?,?,?)";
    var sub = [loginUser.id, provider, id];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
	if (connErr) {
	    return done('Database error', null);
	}

	conn.query(query, function(err, res) {
	    if (err) {
		// The query failed, respond to the error.
		console.log(err.code);
		done(err, null);
	    } else {
		done(null, loginUser);
            }
	});

	conn.release();
    });
}

// Adds a new user to users/local auth. TODO: Use a user object.
// callbaack(err, id)
function addNewUser(user, phash, callback) {
    var query = "INSERT INTO `users` VALUE (null,?,?,?)"
    var sub = [user.email, user.name, "user"];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
	if (connErr) {
	    return callback('Database error', null);
	}

	conn.query(query, function(err, res) {
	    if (err) {
		console.log(err.code);
		callback(err, null);
	    } else {
		setUserHash(res.insertId, phash);
		callback(null, res.insertId);
	    }
	});

	conn.release();
    });
}

function setUserHash(id, auth) {
    var query = "INSERT INTO `local_auth` VALUE (?,?)";
    var sub = [id, auth];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
	if (connErr) {
	    return; //done('Database error', null);
	}

	conn.query(query, function(err, res) {
	    if (err) {
		// The query failed, respond to the error.
		console.log(err.code);
	    }
	});

	conn.release();
    });
}

// Looks up a users bcrypt hash from their registered email, compare pass, and give results to callback.
// callback(err, hash, user)
function getUserHash(email, callback) {
    var query = "SELECT `users`.`userid`, `name`, `email`, `hash`, `usertype` "
        + "FROM `users` "
        + "INNER JOIN `local_auth` USING (`userid`) "
        + "WHERE `email` = ?";
    var sub = [email];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
	if (connErr) {
	    return callback('Database error', false);
	}

	conn.query(query, function(err, res) {
	    if (err) {
		// The query failed, respond to the error.
		callback(err, null, null);
	    } else {
		if (res.length == 0) {
		    callback(null, null, null);
		} else {
                    var user = new users.User(res[0].userid, res[0].name, res[0].email, users.privilegeFromString(res[0].usertype));
                    callback(null, user, res[0].hash);
		}
	    }
	});

	conn.release();
    });
}

module.exports = {init:init, getUserHash:getUserHash, addNewUser:addNewUser, getUser:getUser, extGetUser:extGetUser, addNewImage:addNewImage, getUserImages:getUserImages, checkImagePerm:checkImagePerm, addImageMeta:addImageMeta, getMetaBasic:getMetaBasic, getAnnotations:getAnnotations};

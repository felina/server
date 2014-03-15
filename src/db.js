var mysql = require('mysql');
var dbCFG = require('../config/db_settings.json');
var users = require('./user.js');
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

// checks if the token is expired
function tokenExpiry(email, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query = "SELECT `token_expiry` FROM `users` WHERE `email` = ?";
        var sub = [ email ];
        query = mysql.format(query, sub);

        conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                return callback(err, null);
            } else {
                console.log(JSON.stringify(res));
                if (res.length > 0) {
                    var exp = res[0].token_expiry;
                    if (exp) {
                        var then = new Date(exp);
                        var now = new Date();
                        return callback(null, then.getTime() > now.getTime());
                    } else {
                        return callback(null, false);
                    }
                } else {
                    return callback(null, false);
                }
            }
        });
    });
}

function imageExists(hash, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query = "SELECT * FROM `images` WHERE `imageid` = ?";
        var sub = [ hash ];
        query = mysql.format(query, sub);

        conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                return callback(err, null);
            } else {
                // If res.length > 0, an image with this hash exists already
                return callback(null, res.length);
            }
        });
    });
}

function updateUser(name, email, usertype, profile_image, callback) {
    var query = "UPDATE `users` SET";
    var sub = [];
    var first = true;
    if(!email) {
        callback('Invalid email', false);
    }

    if(name) {
        query += " `name`=?";
        sub.push(name);
        first = false;
    }

    if(profile_image) {
        // Add me
    }

    if(usertype) {
        query += " `usertype`=?";
        sub.push(usertype);
        first = false;
    }

    if(first) {
        return callback('Invalid parameters', false);
    }
    
    query += " WHERE `email`=?";
    sub.push(email);

    connPool.getConnection(function(connErr, conn){
        if (connErr) {
            return callback('Database error', false);
        }

        query = mysql.format(query, sub);
        console.log(query);
        return conn.query(query, function(err, res){
            conn.release();

            if (err) {
                console.log(err);
                callback(err, false);
            } else {
                callback(null, (res.changedRows === 1) );
            }
        });

    });

}

function getJobImageCount(jobid, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query = "SELECT * FROM " +
            "( SELECT COUNT(*) AS `processed` " +
            "  FROM `job_images` " +
            "  WHERE `jobid` = ? " +
            ") AS `a`" +
            "," +
            "( SELECT (COUNT(*) * (COUNT(*) - 1))/2 AS `total` " +
            "  FROM `jobs` " +
            "  INNER JOIN `images` USING (`projectid`) " +
            "  WHERE `jobid` = ? " +
            ") AS `b`";
        var sub = [ jobid, jobid ];
        query = mysql.format(query, sub);

        return conn.query(query, function(err, res) {
            if (err) {
                console.log(err);
                return callback(err);
            } else {
                return callback(null, res);
            }
        });
    });
}

function getProjects(showAll, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query = "SELECT `name` FROM `projects`";
        if (!showAll) {
            query = query + " WHERE active";
        }

        return conn.query(query, function(err, res) {
            if (err) {
                console.log(err);
                return callback(err);
            } else {
                var names = new Array(res.length);
                res.forEach(function(ele, i) {
                    names[i] = ele.name;
                });
                return callback(null, names);
            }
        });
    });
}

function getFields(project, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query = "SELECT `pf`.`name`, `type`, `required`, GROUP_CONCAT(`ed`.`name` SEPARATOR ',') AS `enumvals` " +
            "FROM `project_fields` AS `pf`" +
            "LEFT OUTER JOIN `enum_definitions` AS `ed` USING (`fieldid`) " +
            "WHERE `projectid` = ? GROUP BY `fieldid` ORDER BY `type` ASC";
        var sub = [ project ];
        query = mysql.format(query, sub);
        console.log(query);
        return conn.query(query, function(err, res) {
            if (err) {
                console.log(err);
                return callback(err);
            } else {
                res.forEach(function(ele) {
                    if (ele.type === 'enum') {
                        if (ele.enumvals === null) {
                            console.log('No enum values defined for an enum type!');
                            ele.enumvals = [];
                        } else {
                            ele.enumvals = ele.enumvals.split(',');
                        }
                    } else {
                        delete ele.enumvals;
                    }
                });
                return callback(null, res);
            }
        });
    });
}

function setFields(project, fieldList, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query = "INSERT INTO `project_fields` (`projectid`,`name`,`type`) VALUES ";
        var sub = new Array(fieldList.length * 3);
        var i;
        for (i = 0; i < fieldList.length - 1; i++) {
            query = query + "(?,?,?),";
            sub[i * 3] = project;
            sub[(i * 3) + 1] = fieldList[i].name;
            sub[(i * 3) + 2] = fieldList[i].type;
        }
        // Add the final record
        query = query + "(?,?,?)";
        sub[i * 3] = project;
        sub[(i * 3) + 1] = fieldList[i].name;
        sub[(i * 3) + 2] = fieldList[i].type;

        query = mysql.format(query, sub);
        console.log(query);
        return conn.query(query, function(err, res) {
            if (err) {
                console.log(err);
                return callback(err);
            } else {
                return callback();
            }
        });
    });
}

function getProject(id, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query;
        if (typeof id === 'number') {
            query = "SELECT * FROM `projects` WHERE `projectid` = ?";
        } else {
            query = "SELECT * FROM `projects` WHERE `name` = ?";
        }

        var sub = [ id ];
        query = mysql.format(query, sub);
        console.log(query);
        conn.query(query, function(err, res) {
            if (err) {
                console.log(err);
                return callback(err);
            } else if (res.length < 1) {
                return callback(null, null);
            } else {
                return callback(null, res);
            }
        });
    });
}

function createProject(proj, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query = 'INSERT INTO `projects` (`name`,`desc`,`active`) VALUE (?,?,?)';
        var sub = [ proj.name, proj.desc, proj.active ];
        query = mysql.format(query, sub);

        conn.query(query, function(err, res) {
            if (err) {
                console.log(err);
                return callback(err);
            } else {
                return callback(null, res.insertId);
            }
        });
    });
}

function geomWKTToPoints(WKT, location) {
    if (location) {
        // Locations should hold points only, and use lat/lon instead of x/y
        var ptStart = WKT.lastIndexOf('POINT(', 0);
        var ptEnd = WKT.indexOf(')', 9);
        if (ptStart !== 0 || ptEnd < 0) {
            console.log('WKT location is not a point! ' + WKT);
            return false;
        } else {
            var pts = WKT.substring(6, ptEnd).split(' ');
            return {
                'lat': parseFloat(pts[0]),
                'lon': parseFloat(pts[1])
            };
        }
    } else {
        var parStart = WKT.lastIndexOf('(', 11);
        var parEnd = WKT.indexOf(')', 6);
        if (parStart < 0 || parEnd < 0 || parStart + 3 >= parEnd) {
            console.log('WKT has invalid start or end! ' + WKT);
            return false;
        } else {
            var paramGroups = WKT.substring(parStart + 1, parEnd).split(',');
            var region = new Array(paramGroups.length);
            paramGroups.forEach(function(paramGroup, i) {
                var params = paramGroup.split(' ');
                if (params.length !== 2) {
                    console.log('WKT param group is invalid ' + paramGroup);
                } else {
                    region[i] = {
                        'x': params[0],
                        'y': params[1]
                    };
                }
            });
            return region;
        }
    }
}

function pointsToGeomWKT(region, location) {
    if (location) {
        // Locations should hold points only, and use lat/lon instead of x/y
        return "POINT(" + region[0].lat + " " + region[0].lon + ")";
    } else if (region.length === 1) {
        // A single point.
        return "POINT(" + region[0].x + " " + region[0].y + ")";
    } else if (region.length === 2) {
        // A simple line.
        return "LINESTRING(" + region[0].x + " " + region[0].y + ", " + region[1].x + " " + region[1].y + ")";
    } else {
        // A polygon.
        var i;
        var wkt = "POLYGON((";
        for (i = 0; i < region.length - 1; i++) {
            wkt += region[i].x + " " + region[i].y + ", ";
        }
        wkt += region[i].x + " " + region[i].y + "))";
        return wkt;
    }
}

function condenseAnnotations(annotations) {
    // To make query generation simpler, we will create a condensed array of only valid regions.
    var cond = [];
    for (var key in annotations) {
        if (annotations.hasOwnProperty(key)) {
            if (annotations[key] !== false) {
                // TODO: Support multiple annotations per field.
                // This must contain a valid region, keep. Set the key as an attribute.
                annotations[key].shapes[0].title = key;
                cond.push(annotations[key].shapes[0]);
            } else {
                console.log("Condensing anno");
            }
        }
    }
    return cond;
}

// Adds annotation to an image.
function addImageAnno(iid, annotations, callback) {
    var anno = condenseAnnotations(annotations);

    // Count annotations length
    var annotationsLength = 0;
    for (var k in annotations) {
        if (annotations.hasOwnProperty(k)) {
            ++annotationsLength;
        }
    }

    if (anno.length <= 0) {
        console.log('Tried to insert empty annotations list!');
        return callback('No valid annotations provided', false);
    } else {
        var query = "INSERT INTO `image_meta_annotations` ";
        var sub = new Array(anno.length * 3);
        var i;
        for (i = 0; i < anno.length - 1; i++) {
            // We can't do a nice insert here as we have to lookup a fieldid from a field name.
            query = query + "SELECT `images`.`imageid`, `fieldid`, GeomFromText(?) AS `region` " +
                "FROM `project_fields` " +
                "INNER JOIN `images` USING (`projectid`) " +
                "WHERE `images`.`imageid` = ? AND `project_fields`.`name` = ? " +
                "UNION ";
            sub[i * 3] = pointsToGeomWKT(anno[i].points);
            sub[(i * 3) + 1] = iid;
            sub[(i * 3) + 2] = anno[i].title;
        }
        // Add the final record
        query = query + "SELECT `images`.`imageid`, `fieldid`, GeomFromText(?) AS `region` " +
            "FROM `project_fields` " +
            "INNER JOIN `images` USING (`projectid`) " +
            "WHERE `images`.`imageid` = ? AND `project_fields`.`name` = ? ";
        sub[i * 3] = pointsToGeomWKT(anno[i].points);
        sub[(i * 3) + 1] = iid;
        sub[(i * 3) + 2] = anno[i].title;

        // Allow updating of already set values.
        query = query + 
            "ON DUPLICATE KEY UPDATE " +
            "`region` = VALUES(`region`)";

        query = mysql.format(query, sub);
        connPool.getConnection(function(connErr, conn) {
            if (connErr) {
                return callback('Database error', false);
            }
            conn.query(query, function(err, res) {
                if (err) {
                    console.log(err);
                    console.log(query);
                    callback(err, null);
                } else {
                    // affectedRows is incremented twice if an UPDATE is performed!
                    console.log('Alteration count ' + res.affectedRows + ' out of a filtered ' + anno.length + ' of total ' + annotationsLength + ' annotations into db.');
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

    if (md.metadata.title) {
        // Add me
    }
    if (md.metadata.datetime) {
        if (!first) {
            query += ",";
        }
        query += " `datetime`=?";
        sub.push(md.metadata.datetime);
        first = false;
    }
    if (md.metadata.location) {
        if (!first) {
            query += ",";
        }
        query += " `location`=PointFromText(?)";
        var point = "POINT(" + md.metadata.location.coords.lat + " " + md.metadata.location.coords.lng + ")";
        sub.push(point);
        first = false;
    }
    if (typeof md.metadata.priv !== 'undefined' && md.metadata.priv !== null) {
        if (!first) {
            query += ",";
        }
        query += " `private`=?";
        sub.push(md.metadata.priv);
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

                // Count annotations length
                var annotationsLength = 0;
                for (var k in md.annotations) {
                    if (md.annotations.hasOwnProperty(k)) {
                        ++annotationsLength;
                    }
                }

                if (e) {
                    console.log(e);
                    // false if any errors occured in either query.
                    rSet.push(false);
                } else if (md.annotations !== null && annotationsLength > 0) {
                    return addImageAnno(md.id, md.annotations, function(e2, r2) {
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

// Updates image metadata TODO: Check privileges!
function addImageMeta(mdArr, callback) {
    return updateMetaR(mdArr, callback, []);
}

// Checks eligibility to load an image.
function checkImagePerm(uid, id, callback) {
    var query = "SELECT (`ownerid`=? OR NOT `private`) AS 'open', `private` FROM `images` WHERE `imageid`=?";
    var sub = [uid, id];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback('Database error', null);
        }

        conn.query(query, function(err, res) {
            if (err) {
                console.log(err.code);
                callback(err, null);
            } else if (res.length === 0 || !res[0].open) {
                // Image id doesn't exist
                callback(null, null);
            } else {
                callback(null, res[0].private);
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
                if (res.length > 0) {
                    if (res[0].location !== null) {
                        res[0].location = geomWKTToPoints(res[0].location, true);
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

function getImageFields(iid, callback) {
    var query = "SELECT `pf`.`name`, `pf`.`type`, `stringval` AS 'val' " +
        "FROM `project_fields` AS `pf` " +
        "INNER JOIN `images` USING (`projectid`) " +
        "INNER JOIN `image_meta_string` AS `ims` " +
        "ON `images`.`imageid` = `ims`.imageid AND `pf`.`fieldid` = `ims`.`fieldid` AND `type`='string' " +
        "WHERE `images`.`imageid` = ? " +
        "UNION " +
        "SELECT `pf`.`name`, `pf`.`type`, `numberval` " +
        "FROM `project_fields` AS `pf` " +
        "INNER JOIN `images` USING (`projectid`) " +
        "INNER JOIN `image_meta_number` AS `imn` " +
        "ON `images`.`imageid` = `imn`.imageid AND pf.fieldid = imn.fieldid AND type='number' " +
        "WHERE `images`.`imageid` = ? " +
        "UNION " +
        "SELECT `pf`.`name`, `pf`.`type`, `ed`.`name` " +
        "FROM `project_fields` AS `pf` " +
        "INNER JOIN `images` USING (`projectid`) " +
        "INNER JOIN `image_meta_enum` AS `ime` " +
        "ON `images`.`imageid` = `ime`.imageid AND pf.fieldid = ime.fieldid AND type='enum' " +
        "INNER JOIN `enum_definitions` AS `ed` " +
        "ON `ed`.`enumval`=`ime`.`enumval` AND `ed`.`fieldid`=`pf`.`fieldid` " +
        "WHERE `images`.`imageid` = ?";
    var sub = [ iid, iid, iid ];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            console.log(connErr);
            return callback(connErr, false);
        }

        conn.query(query, function(err, res) {
            conn.release();

            if (err) {
                console.log(err.code);
                callback(err, null);
            } else {
                callback(null, res);
            }
        });
    });
}

function getAnnotations(iid, callback) {
    var query = "SELECT `project_fields`.`name`, AsText(`region`) AS 'region' " +
        "FROM `image_meta_annotations` " +
        "INNER JOIN `project_fields` USING (`fieldid`) " +
        "WHERE `imageid`=?";
    var sub = [iid];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            console.log(connErr);
            return callback(connErr, false);
        }

        conn.query(query, function(err, res) {
            conn.release();

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
function addNewImage(user, project, imageHash, callback) {
    var query = "INSERT INTO `images` (imageid, ownerid, projectid) VALUE (?,?,?)";
    var sub = [imageHash, user.id, project];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback('Database error');
        }

        conn.query(query, function(err, res) {
            if (err) {
                console.log(err.code);
                callback(err);
            } else {
                console.log('Inserted image into db.');
                callback();
            }
        });

        conn.release();
    });
}

// Attempts to deserialize a user, passing it to the done callback.
// done(err, user)
function getUser(id, done) {
    var query = "SELECT `email`, `name`, `usertype`, `gravatar` " +
        "FROM `users` " +
        "WHERE `userid` = ?";

    var sub = [id];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            // TODO this function doesn't exist
            // return callback('Database error', false);
        }

        conn.query(query, function(err, res) {
            if (err) {
                // The query failed, respond to the error.
                done(err, false);
            } else {
                if (res.length === 0) {
                    done(null, false);
                } else {
                    var user = new users.User(id, res[0].name, res[0].email, users.privilegeFromString(res[0].usertype), res[0].gravatar);
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

// Attempts to get a user (initialise login) via an external provider
function extGetUser(id, provider, loginUser, done) {
    var query = "SELECT `users`.`userid`, `email`, `name`, `usertype`, `gravatar` " +
        "FROM `users` " +
        "INNER JOIN `ext_auth` USING (`userid`) " +
        "WHERE `provider` = ? AND `service_id` = ?";

    var sub = [provider, id];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return done('Database error', null);
        }

        conn.query(query, function(err, res) {
            var user;

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
                        user = new users.User(res[0].userid, res[0].name, res[0].email, users.privilegeFromString(res[0].usertype), res[0].gravatar);
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
                        user = new users.User(res[0].userid, res[0].name, res[0].email, users.privilegeFromString(res[0].usertype), res[0].gravatar);
                        done(0, user);
                    }
                }
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

//change user password-hash
function updateUserHash(email, auth, callback) {
    var query = "UPDATE `local_auth` SET `hash`=? WHERE `userid` IN (SELECT `userid` FROM `users` WHERE `email`=?)";
    var sub = [ auth, email];

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return; //done('Database error', null);
        }
        query = mysql.format(query, sub);
        conn.query(query, function(err, res) {
            if (err) {
                // The query failed, respond to the error.
                console.log(err.code);
                callback(err,null);
            } else {
                console.log(JSON.stringify(res));
                callback(null, res.changedRows === 1);
            }
        });
        conn.release();
    });
}

// Adds a new user to users/local auth. TODO: Use a user object.
// callback(err, id)
function addNewUser(user, phash, vhash, callback) {
    var query = "INSERT INTO `users` (userid, email, name, usertype, gravatar, validation_hash) VALUE (null,?,?,?,?,?)";
    var sub = [user.email, user.name, "user", user.gravatar, vhash];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback('Database error', null);
        }

        conn.query(query, function(err, res) {
            conn.release();

            if (err) {
                console.log(err.code);
                callback(err, null);
            } else {
                setUserHash(res.insertId, phash);
                callback(null, res.insertId);
            }
        });
    });
}

function addNewSub(user, phash, supervisor, callback) {
    var query = "INSERT INTO `users` (userid, email, name, usertype, supervisor, token_expiry) VALUE (null,?,?,?,?,?)";
    var date = new Date();
    date.setHours(date.getHours() + 1);
    var sub = [user.email, user.name, "subuser", supervisor, date.toJSON()];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback('Database error', null);
        }

        conn.query(query, function(err, res) {
            conn.release();

            if (err) {
                console.log(err.code);
                callback(err, null);
            } else {
                setUserHash(res.insertId, phash);
                callback(null, res.insertId);
            }
        });
    });
}

function validateEmail(vhash, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback('Database error', null);
        }

        var query = "UPDATE `users` SET `validation_hash`=NULL WHERE `validation_hash`=?";
        var sub = [vhash];
        query = mysql.format(query, sub);

        conn.query(query, function(err, res) {
            conn.release();

            if (err) {
                console.log(err.code);
                callback(err, null);
            } else {
                callback(null, (res.changedRows === 1) );
            }
        });
    });
}

// Looks up a users bcrypt hash from their registered email, compare pass, and give results to callback.
// callback(err, hash, user)
function getUserHash(email, callback) {
    var query = "SELECT `users`.`userid`, `name`, `email`, `hash`, `usertype`, `gravatar` " +
        "FROM `users` " +
        "INNER JOIN `local_auth` USING (`userid`) " +
        "WHERE `email` = ?";
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
                if (res.length === 0) {
                    callback(null, null, null);
                } else {
                    var user = new users.User(res[0].userid, res[0].name, res[0].email, users.privilegeFromString(res[0].usertype), res[0].gravatar);
                    callback(null, user, res[0].hash);
                }
            }
        });

        conn.release();
    });
}

module.exports = {
    init: init,
    imageExists:imageExists,
    getJobImageCount:getJobImageCount,
    getImageFields:getImageFields,
    getProjects:getProjects,
    getFields:getFields,
    setFields:setFields,
    getProject:getProject,
    createProject:createProject,
    getUserHash: getUserHash,
    addNewUser: addNewUser,
    addNewSub: addNewSub,
    getUser: getUser,
    extGetUser: extGetUser,
    addNewImage: addNewImage,
    getUserImages: getUserImages,
    checkImagePerm: checkImagePerm,
    addImageMeta: addImageMeta,
    getMetaBasic: getMetaBasic,
    getAnnotations: getAnnotations,
    validateEmail: validateEmail,
    updateUser: updateUser,
    tokenExpiry: tokenExpiry,
    updateUserHash: updateUserHash
};

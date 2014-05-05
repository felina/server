/**
 * @module db
 */

var mysql = require('mysql');
var _ = require('underscore');
var Project = require('./models/Project.js');
var User = require('./models/User.js');

/**
 * The configuration to use to connect to MySQL.
 */
var dbCFG = require('../config/db_settings.json');
// Set timezone to UTC so that node-mysql doesn't convert DATETIME values for us
dbCFG.timezone = '+0000';

/**
 * The MySQL connection pool.
 */
var connPool = mysql.createPool(dbCFG);

/**
 * Generic error-only callback
 * @callback errorCallback
 * @param {Error} err - The error that occurred, if present.
 */

/**
 * Runs a test to check database credentials and state.
 * @static
 * @param {errorCallback} callback - The callback that handles the test outcome.
 */
function init(callback) {
    // Test connection parameters.
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        conn.query('SELECT `userid`, `email`, `name`, `usertype` FROM `users` LIMIT 0', function(err, res) {
            conn.release();
            if (err) {
                return callback(err);
            } else {
                return callback(null);
            }
        });
    });
}

function jobDone(complete, jobid, callback) {
    if (!complete) {
        return callback(null, true);
    }
    var query = "UPDATE `jobs` SET `done` = (1) WHERE `jobid` = (?)";
    query = mysql.format(query, [jobid]);
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr, null);
        }
        conn.query(query, function(err, res) {
            if (err) {
                return callback(err, null);
            }
            return callback(null, true);
        });  
    });
}

/**
 * Job list handling callback.
 * @callback jobListCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {Job[]} jobs - The list of all jobs.
 */

/**
 * Gets a list of all jobs belonging to the given user.
 * @static
 * @param {User} user - The owner of the jobs.
 * @param {jobListCallback} callback - The callback that handles the list of jobs.
 */
function getJobs(user, callback) {
    var query = "SELECT * FROM `jobs` WHERE ownerid = (?) AND done = FALSE";
    query = mysql.format(query, [user.id]);
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback('Database error');
        }
        return conn.query(query, function(err, res) {
            if (err) {
                return callback(err, null);
            }
            return callback(null, res);
        });
    });
}

/**
 * Transaction handling job creation callback.
 * @callback optionalJobAddCallback
 * @param {Error} err - The error the occurred, if present.
 * @param {number} id - The id assigned to the zip.
 * @param {tcControlCallback} accept - The callback that optionally rolls back the insert, if deemed necessary.
 */

/**
 * Adds a job to the database, optionally allowing the caller to accept or rollback the insert at a later point.
 * @static
 * @param {number} executableId - The id of the associated executable.
 * @param {string} name - The name of the job.
 * @param {string} command - The name of the executable.
 * @param {number} userId - The id of the user who owns the job.
 * @param {optionalJobAddCallback} callback - The callback that handles the insert and decides whether the operation should be accepted or not.
 */
function addJob(executableId, name, command, userId, callback) {
    var query = "INSERT INTO `jobs` (name, exeid, ownerid, command) VALUE (?,?,?,?)";
    var sub = [name, executableId, userId, command];
    query = mysql.format(query, sub);
    console.log(query);
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback('Database error');
        }
        // Start a transaction
        return conn.beginTransaction(function(tcErr) {
            if (tcErr) {
                console.log(tcErr);
                conn.release();
                return callback(tcErr);
            } else {
                conn.query(query, function(err, res) {
                    if (err) {
                        console.log(err.code);
                        // There was an error, so we should rollback.
                        conn.rollback(function() {
                            callback(err);
                            return conn.release();
                        });
                    } else {
                        console.log('Inserted job into db.');
                        console.log(res);
                        return callback(null, res.insertId, function(accept) {
                            // The accept callback, the calling code will decide whether to commit.
                            if (accept) {
                                conn.commit(function(cmErr) {
                                    // If we fail at this point, we will just fail silently. The user will
                                    // be able to retry the upload without issue.
                                    if (cmErr) {
                                        conn.rollback(function () {
                                            console.log(cmErr);
                                            return conn.release();
                                        });
                                    } else {
                                        return conn.release();
                                    }
                                });
                            } else {
                                // Rollback the insert, as requested.
                                conn.rollback(function() {});
                                return conn.release();
                            }
                        });
                    }
                });
            }
        });
    });
}

/**
 * Zip listing callback.
 * @callback zipListCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {object[]} list - The list of all records found for the given user.
 */

/**
 * Retrieves a list of executable zips uploaded by a user.
 * @static
 * @param {user.User} user - The user to fetch zips from.
 * @param {zipListCallback} callback - The callback that handles the result of trying to fetch the list of zips.
 */
function zipsForUser(user, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }
        var query = "SELECT * FROM `executables` WHERE `ownerid` = ?";
        var sub = [ user.id ];
        query = mysql.format(query, sub);

        conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                return callback(err, null);
            } else {
                return callback(null, res);
            }
        });
    });
}

/**
 * Transaction accept/deny callback
 * @callback tcControlCallback
 * @param {boolean} accept - If true, the transaction will be committed. If false, it will be rolled back.
 */

/**
 * Transaction handling zip upload callback.
 * @callback optionalZipAddCallback
 * @param {Error} err - The error the occurred, if present.
 * @param {number} id - The id assigned to the zip.
 * @param {tcControlCallback} accept - The callback that optionally rolls back the insert, if deemed necessary.
 */

/**
 * Tries to add a new zip for a given user. Wraps the insert in a transaction so that the callback can decide whether to undo the operation.
 * @static
 * @param {user.User} user - The user who should be given ownership of the zip.
 * @param {string} name - The display name/description of the zip.
 * @param {string} filename - The filename of the zip.
 * @param {optionalZipAddCallback} callback - The callback that handles the result of trying to add a new zip.
 */
function tcAddNewZip(user, name, filename, callback) {
    var query = "INSERT INTO `executables` (name, filename, ownerid) VALUE (?,?,?)";
    var sub = [name, filename, user.id];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback('Database error');
        }

        // Start a transaction
        return conn.beginTransaction(function(tcErr) {
            if (tcErr) {
                console.log(tcErr);
                conn.release();
                return callback(tcErr);
            } else {
                conn.query(query, function(err, res) {
                    if (err) {
                        console.log(err.code);
                        // There was an error, so we should rollback.
                        conn.rollback(function() {
                            callback(err);
                            return conn.release();
                        });
                    } else {
                        console.log('Inserted executable into db.');
                        return callback(null, res.insertId, function(accept) {
                            // The accept callback, the calling code will decide whether to commit.
                            if (accept) {
                                conn.commit(function(cmErr) {
                                    // If we fail at this point, we will just fail silently. The user will
                                    // be able to retry the upload without issue.
                                    if (cmErr) {
                                        conn.rollback(function () {
                                            console.log(cmErr);
                                            return conn.release();
                                        });
                                    } else {
                                        return conn.release();
                                    }
                                });
                            } else {
                                // Rollback the insert, as requested.
                                conn.rollback(function() {});
                                return conn.release();
                            }
                        });
                    }
                });
            }
        });
    });
}

/**
 * Subuser listing callback.
 * @callback subuserListCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {object[]} list - The list of all subusers found for the given user.
 */

/**
 * Retrieves a list of subusers supervised by a specified user.
 * @static
 * @param {number} id - The user id to find subusers of.
 * @param {subuserListCallback} callback - The callback that handles the result of trying to fetch the list of subusers.
 */
function getSubusers(id, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            console.log(connErr);
            return callback(connErr);
        }

        var query = "SELECT `name`, `email`, `assigned_project` AS 'projectid', `token_expiry` IS NOT NULL AS 'valid' FROM `users` WHERE `supervisor` = ?";
        var sub = [ id ];

        query = mysql.format(query, sub);

        conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                console.log(err);
                console.log(query);
                return callback(err);
            } else {
                console.log(res);
                return callback(null, res);
            }
        });
    });
}

/**
 * Attempts to delete an image.
 * @static
 * @param {string} id - The image id to delete.
 * @param {errorCallback} callback - The callback that handles the result of trying to delete the image.
 */
function deleteImage(id, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            console.log(connErr);
            return callback(connErr);
        }

        var query = "DELETE FROM `images` WHERE `imageid` = ?";
        var sub = [ id ];
        query = mysql.format(query, sub);

        conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                console.log(err);
                console.log(query);
                return callback(err);
            } else {
                return callback();
            }
        });
    });
}

/**
 * Generic boolean callback.
 * @callback booleanCallback
 * @param {Error} [err] - The error that occurred, if present.
 * @param {boolean} bool - Whether the outcome was considered a success.
 */

/**
 * Checks whether a given subuser's token has expired.
 * @static
 * @param {string} email - The user email.
 * @param {booleanCallback} callback - The callback that handles the result of checking a token's validity. True if valid.
 */
function tokenExpiry(email, callback) {
    return connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        // Do the time comparison MySQL side to avoid timezone conversion issues. Only allow subusers access.
        var query = "SELECT `token_expiry` > NOW() AS 'res' FROM `users` WHERE `email` = ? AND `usertype` = 'subuser'";
        var sub = [ email ];

        query = mysql.format(query, sub);

        return conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                return callback(err, null);
            } else {
                if (res.length > 0) {
                    return callback(null, res[0].res);
                } else {
                    return callback(null, false);
                } 
            }
        });
    });
}

/**
 * Checks if the given image exists.
 * @static
 * @param {string} hash - The id of the image to look for.
 * @param {booleanCallback} callback - The callback that handles the result of the check for the image.
 */
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

/**
 * Tries to update a given subuser.
 * @static
 * @param {number} id - The user id of the supervisor.
 * @param {string} email - The email of the subuser.
 * @param {string} [name] - The name to assign to the subuser.
 * @param {boolean} [refresh] - If present and true, the subuser's token validity will be reset
 * @param {number} [projectid] - The project id the subuser should be assigned to.
 * @param {booleanCallback} callback - The callback that handles the result of trying to update a subuser.
 */
function updateSubuser(id, email, name, refresh, projectid, callback) {
    var query = "UPDATE `users` SET";
    var sub = [];
    var first = true;
    
    if (!id || !email) {
        return callback(null, false);
    }

    if (name) {
        if (!first) {
            query += ",";
        }
        query += " `name` = ?";
        sub.push(name);
        first = false;
    }

    if (projectid) {
        if (!first) {
            query += ",";
        }
        query += " `assigned_project` = ?";
        sub.push(projectid);
        first = false;
    }

    if (refresh) {
        if (!first) {
            query += ",";
        }
        query += " `token_expiry` = (NOW() + INTERVAL 1 HOUR)";
        first = false;
    }

    if (first) {
        return callback(null, false);
    }

    query += " WHERE `email` = ? AND `supervisor` = ?";
    sub.push(email, id);
    
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
                return callback(err, false);
            } else {
                return callback(null, (res.changedRows === 1));
            }
        });
    });
}

/**
 * Tries to update a given user.
 * @static
 * @param {string} [name] - The name to assign to the user.
 * @param {string} email - The email of the user to update.
 * @param {string} [usertype] - The usertype to give the user.
 * @param {string} [profile_image] - The hash of the user's gravatar.
 * @param {number} [supervisor] - The id of the supervisor to give this user. Should only be set with a usertype of subuser!
 * @param {boolean} [token_expiry] - Whether to set the token expiry or not. Valid only for subusers!
 * @param {booleanCallback} callback - The callback that handles the result of trying to update the user.
 */
function updateUser(name, email, usertype, profile_image, supervisor, token_expiry, callback) {
    var query = "UPDATE `users` SET";
    var sub = [];
    var first = true;

    if (!email) {
        return callback('Invalid email', false);
    }

    if (name) {
        if (!first) {
            query += ",";
        }
        query += " `name` = ?";
        sub.push(name);
        first = false;
    }

    if (profile_image) {
        if (!first) {
            query += ",";
        }
        query += " `profile_image` = ?";
        sub.push(profile_image);
        first = false;
    }

    if (usertype) {
        if(!first){
            query += ",";
        }
        query += " `usertype` = ?";
        sub.push(usertype);
        first = false;
    }

    if (supervisor) {
        if (!first) {
            query += ",";
        }
        query += " `supervisor` = ?";
        sub.push(supervisor);
        first = false;
    }

    if (token_expiry) {
        if (!first) {
            query += ",";
        }
        query += " `token_expiry` = (NOW()-INTERVAL 1 HOUR)";
        first = false;
    }

    if (first) {
        return callback('Invalid parameters', false);
    } 
    
    query += " WHERE `email` = ?";
    sub.push(email);

    return connPool.getConnection(function(connErr, conn){
        if (connErr) {
            return callback('Database error', false);
        }

        query = mysql.format(query, sub);
        console.log(query);
        return conn.query(query, function(err, res){
            conn.release();

            if (err) {
                console.log(err);
                return callback(err, false);
            } else {
                return callback(null, (res.changedRows === 1) );
            }
        });
    });
}

/**
 * Project listing callback.
 * @callback projectListCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {string[]|Project[]} projects - The set of project names.
 */

/**
 * Retrieves a list of projects.
 * @static
 * @param {boolean} showAll - If false, the list of projects will be filtered to contain only active projects.
 * @param {number} [id] - If provided, return only the project with the given id.
 * @param {boolean} [details] - If true, a list of Project objects will be returned, instead of names.
 * @param {projectListCallback} callback - The callback that handles the result of trying to fetch the list of projects.
 */
function getProjects(showAll, id, details, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query;
        if (details) {
            query = "SELECT `projectid`, `name`, `desc`, `active` FROM `projects`";
        } else {
            query = "SELECT `name` FROM `projects`";
        }

        var first = true;
        if (!showAll) {
            query = query + " WHERE active";
            first = false;
        }
        if (_.isNumber(id) && id >= 0) {
            if (first) {
                query = query + " WHERE `projectid` = ?";
            } else {
                query = query + " AND `projectid` = ?";
            }
            query = mysql.format(query, [id]);
            first = false;
        }

        return conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                console.log(err);
                return callback(err);
            } else {
                if (details) {
                    return callback(null, res);
                } else {
                    var names = new Array(res.length);
                    res.forEach(function(ele, i) {
                        names[i] = ele.name;
                    });
                    return callback(null, names);
                }
            }
        });
    });
}

/**
 * Tries to update a project's details.
 * @static
 * @param {number} id - The id of the project.
 * @param {string} [name] - The new name of the project.
 * @param {string} [desc] - The new description of the project.
 * @param {boolean} [active] - If the project should be made public.
 * @param {booleanCallback} callback - The callback that details if a project was updated.
 */
function updateProject(id, name, desc, active, callback) {
    var query = "UPDATE `projects` SET";
    var sub = [];
    var first = true;

    if (name) {
        if (!first) {
            query += ",";
        }
        query += " `name` = ?";
        sub.push(name);
        first = false;
    }

    if (desc) {
        if (!first) {
            query += ",";
        }
        query += " `desc` = ?";
        sub.push(desc);
        first = false;
    }

    if (active === true || active === false) {
        if(!first) {
            query += ",";
        }
        query += " `active` = ?";
        sub.push(active);
        first = false;
    }

    if (first) {
        // No changes to be made.
        return callback(null, false);
    }

    query += " WHERE `projectid` = ?";
    sub.push(id);
    
    return connPool.getConnection(function(connErr, conn){
        if (connErr) {
            return callback('Database error', false);
        }
        
        query = mysql.format(query, sub);
        return conn.query(query, function(err, res){
            conn.release();

            if (err) {
                console.log(err);
                console.log(query);
                return callback(err, false);
            } else {
                return callback(null, (res.changedRows === 1) );
            }
        });
    });
}

/**
 * @typedef ProjectField
 * @type {object}
 * @property {string} name - The name of the field.
 * @property {string} type - The type of the field. One of 'string', 'number', 'enum', 'apoly', 'apoint', 'arect'.
 * @property {boolean} required - Whether the field is required or optional.
 * @property {string[]} enumvals - The list of allowed values for an enum field. Null for all other types.
 */
 
/**
 * Field listing callback.
 * @callback fieldListCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {ProjectField[]} fields - The set of field definitions.
 */

/**
 * Retrieves a list of fields defined for a given project.
 * @static
 * @param {number} project - The id of the project to lookup.
 * @param {fieldListCallback} callback - The callback that handles the result of trying to fetch the list of project specific field definitions.
 */
function getFields(project, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query = "SELECT `pf`.`name`, `type`, `required`, GROUP_CONCAT(`ed`.`name` SEPARATOR ',') AS `enumvals` " +
            "FROM `project_fields` AS `pf` " +
            "LEFT OUTER JOIN `enum_definitions` AS `ed` USING (`fieldid`) " +
            "WHERE `projectid` = ? GROUP BY `fieldid` ORDER BY `type` ASC";
        var sub = [ project ];
        query = mysql.format(query, sub);
        return conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                console.log(err);
                console.log(query);
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

/**
 * Tries to add enum values for a given enum field. For internal use only.
 * @static
 * @param {mysql.Connection} conn - The database connection to use.
 * @param {number} project - The id of the project.
 * @param {object[]} fieldList - The list of fields used to setup the project. Must contain all defined fields of type enum for the given project.
 * @param {errorCallback} callback - The callback that handles the result of trying to insert the new enum values.
 */
function setupEnums(conn, project, fieldList, callback) {
    var query = "SELECT `fieldid`, `name` FROM `project_fields` WHERE `projectid` = ? AND `type` = 'enum'";
    var sub = [ project ];
    query = mysql.format(query, sub);
    return conn.query(query, function(err, res) {
        query = "INSERT INTO `enum_definitions` (`fieldid`, `name`) VALUES ";
        sub = [];
        var i, j, enumvals;
        for (i = 0; i < res.length - 1; i++) {
            enumvals = _.findWhere(fieldList, {'name':res[i].name}).enumvals;
            for (j = 0; j < enumvals.length; j++) {
                query = query + "(?,?),";
                sub.push(res[i].fieldid);
                sub.push(enumvals[j]);
            }
        }
        enumvals = _.findWhere(fieldList, {'name':res[i].name}).enumvals;
        for (j = 0; j < enumvals.length - 1; j++) {
            query = query + "(?,?),";
            sub.push(res[i].fieldid);
            sub.push(enumvals[j]);
        }
        query = query + "(?,?)";
        sub.push(res[i].fieldid);
        sub.push(enumvals[j]);

        query = mysql.format(query, sub);
        console.log(query);
        return conn.query(query, function(e, r) {
            conn.release();
            if (e) {
                console.log(e);
                return callback(e);
            } else {
                return callback(null);
            }
        });
    });
}

/**
 * Tries to delete a field from a project. ALL ASSOCIATED DATA WILL BE LOST.
 * @static
 * @param {number} pid - The id of the project.
 * @param {number} fid - The id of the field.
 * @param {booleanCallback} callback - The callback that handles the result of trying to delete the given field.
 */
function deleteFields(pid, fid, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query = "DELETE FROM `project_fields` WHERE `fieldid` = ? AND `projectid` = ?";
        var sub = [ fid, pid ];

        query = mysql.format(query, sub);
        return conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                console.log(err);
                return callback(err);
            } else {
                return callback(null, res.affectedRows === 1);
            }
        });
    });
}

/**
 * Tries to add fields to a project.
 * @static
 * @param {number} project - The id of the project.
 * @param {object[]} fieldList - The list of fields used to setup the project.
 * @param {errorCallback} callback - The callback that handles the result of trying to insert the new fields.
 */
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
                conn.release();
                console.log(err);
                return callback(err);
            } else {
                return callback();//setupEnums(conn, project, fieldList, callback);
            }
        });
    });
}

/**
 * @typedef Project
 * @type {object}
 * @property {number} projectid - The ID of the project.
 * @property {string} name - The name of the project.
 * @property {string} desc - A longer description of a project.
 * @property {boolean} active - If true, the project is open to contributions.
 */

/**
 * Project creation/retrieval callback.
 * @callback projectCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {Project} proj - The affected project.
 */

/**
 * Retrieves a project from it's id.
 * @static
 * @param {number} id - The id of the project to lookup.
 * @param {projectCallback} callback - The callback that handles the found project.
 */
function getProject(id, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query = "SELECT `projectid`, `name`, `desc`, `active` FROM `projects` WHERE ";
        if (typeof id === 'number') {
            query += "`projectid` = ?";
        } else {
            query += "`name` = ?";
        }

        var sub = [ id ];
        query = mysql.format(query, sub);
        console.log(query);
        conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                console.log(err);
                return callback(err);
            } else if (res.length < 1) {
                return callback();
            } else {
                var proj = new Project(res[0].projectid, res[0].name, res[0].desc, res[0].active);
                return callback(null, proj);
            }
        });
    });
}

/**
 * Checks if a user is allowed to modify a project.
 * @static
 * @param {user.User} user - The user to check.
 * @param {number} pid - The id of the project to lookup.
 * @param {booleanCallback} callback - The callback that tells if the use can modify the project or not.
 */
function checkProjectAccess(user, pid, callback) {
    if (user.isAdmin()) {
        return callback(null, true);
    }

    return connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query = "SELECT `access_level` FROM `project_rights` WHERE `projectid` = ? AND `userid` = ?";
        var sub = [ pid, user.id ];

        query = mysql.format(query, sub);
        return conn.query(query, function(err, access) {
            conn.release();
            if (err) {
                console.log(err);
                return callback(err);
            } else {
                // For now, ignore the access_level property.
                return callback(null, access.length === 1);
            }
        });
    });
}

/**
 * Gives or revokes a user's access to a project.
 * @static
 * @param {user.User} user - The user to give access.
 * @param {number} pid - The id of the project.
 * @param {boolean} give - If true, the user will be given access. If false, access will be revoked.
 * @param {errorCallback} callback - The callback that handles the error state, if present.
 */
function setProjectAccess(user, pid, give, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query;
        if (give) {
            query = 'INSERT INTO `project_rights` (`projectid`,`userid`,`access_level`) VALUE (?,?,1)';
        } else {
            query = 'DELETE FROM `project_rights` WHERE `projectid` = ? AND `userid` = ?';
        }

        var sub = [ pid, user.id ];
        query = mysql.format(query, sub);

        conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                console.log(err);
                return callback(err);
            } else {
                return callback();
            }
        });
    });
}
    

/**
 * Tries to create a project.
 * @static
 * @param {user.User} user - The user who should be set as the owner of the project.
 * @param {Project} project - The project to create. The ID will be ignored.
 * @param {projectCallback} callback - The callback that handles the newly created project. The project object will have it's id set.
 */
function createProject(user, proj, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback(connErr);
        }

        var query = 'INSERT INTO `projects` (`name`,`desc`,`active`) VALUE (?,?,?)';
        var sub = [ proj.name, proj.desc, proj.active ];
        query = mysql.format(query, sub);

        return conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                console.log(err);
                return callback(err);
            } else {
                // Update the project object with it's new id.
                proj.id = res.insertId;
                return setProjectAccess(user, proj.id, true, function(aErr) {
                    if (aErr) {
                        console.log('Warning, setAccess failed on project create. Project orphaned!');
                        return callback(aErr, proj);
                    } else {
                        return callback(null, proj);
                    }
                });
            }
        });
    });
}

/**
 * Converts WKT representation to the desired object representation.
 * @param {string} WKT - The WKT representation of a geometry. As returned by MySQL's AsText() function.
 * @param {boolean} [location=false] - If true, the WKT will be represented as a point on the globe.
 * @returns {object} The object representation of the supplied WKT.
 */
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

/**
 * Converts WKT representation to the desired object representation.
 * @param {object[]} region - A list of x/y (or lat/lon) points. The final point of a polygon should match the first.
 * @param {boolean} [location=false] - If true, the region will be interpreted as a point on the globe.
 * @returns {object} The WKT representation of the given region.
 */
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

/**
 * Takes an annotations object and filters it into a list of only valid annotations.
 * @param {object} annotations - An annotations object, mapping field names to annotations or false values. As produced by the field parser in metadata upload.
 * @returns {object} A list of annotation objects, with their associated keys saved as title properties. False values will be filtered.
 */
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
 
/**
 * Metadata set callback.
 * @callback metadataSetCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {object} result - An object detailing the result of the insertion.
 */

/**
 * Adds annotations to the given image.
 * @param {string} iid - The id of the image to attach the annotations to.
 * @param {object} annotations - An annotations object mapping field names to region definitions. As provided by the metadata upload parser.
 * @param {metadataSetCallback} callback - The callback that handles the result of trying to fetch the list of projects.
 */
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
        console.log('Tried to insert empty annotations list, or none were valid!');
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

/**
 * Recursive metadata update function. For internal use only!
 * @param {user.User} user - The user adding the metadata.
 * @param {object} mdObj - An object mapping image ids to metadata objects. As created by the metadata upload parser.
 * @param {metadataSetCallback} callback - The callback that handles the result of trying to fetch the list of projects.
 * @param {boolean[]} rSet - The record of success/failure for all previous metadata updates.
 */
function updateMetaR(user, mdObj, callback, rSet) {
    var topID = null;
    var mdLength = 0;
    var uid = user.id;
    // Allow researchers and above to edit metadata freely.
    var override = user.isResearcher(true);

    for (var id in mdObj) {
        if (mdObj.hasOwnProperty(id)) {
            if (topID === null) {
                topID = id;
            }
            mdLength++;
        }
    }

    if (mdLength === 0) {
        // Reached the end, send to callback.
        return callback(rSet);
    }

    var first = true;
    var md = mdObj[id];
    delete mdObj[id];
    var query = "UPDATE `images` SET";
    var sub = [];

    if (md === false) {
        console.log('Skipping an invalid id.');
        rSet.push(false);
        return updateMetaR(user, mdObj, callback, rSet);
    }

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

    query += " WHERE `imageid`=? AND (? OR `ownerid`=?)";
    sub.push(id, override, uid);

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
                } else if (r.affectedRows === 0) {
                    // The given id was not found
                    console.log('Update metadata id not found, or not owner.');
                    rSet.push(false);
                } else if (md.annotations !== null && annotationsLength > 0) {
                    console.log('Adding image anno.');
                    return addImageAnno(id, md.annotations, function(e2, r2) {
                        if (e2) {
                            console.log(e2);
                            rSet.push(false);
                        } else {
                            rSet.push(true);
                        }

                        return updateMetaR(user, mdObj, callback, rSet);
                    });
                } else {
                    console.log('No image anno');
                    rSet.push(true);
                }

                return updateMetaR(user, mdObj, callback, rSet);
            });
        });
    } else {
        console.log('Skipping entry with no meta.'); //TODO: anno support here
        rSet.push(false);
        return updateMetaR(user, mdObj, callback, rSet);
    }
}

/**
 * Metadata update helper function. Wraps {@link updateMetaR}.
 * @static
 * @param {user.User} user - The user adding the metadata.
 * @param {object} mdObj - An object mapping image ids to metadata objects. As created by the metadata upload parser.
 * @param {metadataSetCallback} callback - The callback that handles the result of trying to fetch the list of projects.
 */
function addImageMeta(user, mdArr, callback) {
    return updateMetaR(user, mdArr, callback, []);
}

/**
 * Image access details callback.
 * @callback imageAccessCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {boolean} allow - If the user should be allowed to access the resource.
 * @param {boolean} priv - If the image is in the private bucket.
 */

/**
 * Checks the access control properties for a given image and returns the containing bucket.
 * @static
 * @param {User} user - The user to check the access of.
 * @param {string} id - The id of the image to lookup.
 * @param {imageAccessCallback} callback - The callback that handles the access properties of the image.
 */
function checkImagePerm(user, iid, callback) {
    var uid = user ? user.id : -1;
    var override = user ? (user.isAdmin() ? 1 : 0) : 0;
    var query = "SELECT (? OR `researcher` IS NOT NULL OR `ownerid` = ? OR NOT `private`) AS 'open', `private` AS 'priv' FROM `images` LEFT OUTER JOIN (SELECT `userid` AS 'researcher', `projectid` FROM `project_rights` WHERE `userid` = ?) AS `pr` USING (`projectid`) WHERE `imageid` = ?";
    var sub = [ override, uid, uid, iid ];
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
                callback(null, !!res[0].open, !!res[0].priv);
            }
        });

        conn.release();
    });
}

/**
 * @typedef ImageMeta
 * @type {object}
 * @property {Date} datetime - The time and date the picture was taken.
 * @property {object} location - A lat/lon pair detailing where the image was taken.
 * @property {boolean} private - Whether the image should be viewable by other users or not.
 */

/**
 * Basic image metadata callback.
 * @callback imageMetaCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {ImageMeta|boolean} meta - The basic image metadata, or boolean false if the image was not found or access was denied.
 */

/**
 * Retrieves the basic metadata for an image, checking that the user is allowed access.
 * @static
 * @param {!user.User} user - The user attempting to fetch this metadata.
 * @param {string} iid - The id of the image to lookup.
 * @param {imageMetaCallback} callback - The callback that handles the basic image metadata.
 */
function getMetaBasic(user, iid, callback) {
    var uid = user ? user.id : -1;
    var override = user ? user.isResearcher(true) : false;
    var query = "SELECT `datetime`, AsText(`location`) AS 'location', `private` FROM `images` WHERE `imageid`=? AND (? OR `ownerid`=? OR NOT `private`)";
    var sub = [iid, override, uid];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback('Database error');
        }

        return conn.query(query, function(err, res) {
            conn.release();

            if (err) {
                console.log(err.code);
                return callback(err);
            } else {
                if (res.length > 0) {
                    if (res[0].location !== null) {
                        res[0].location = geomWKTToPoints(res[0].location, true);
                    }
                    return callback(null, res[0]);
                } else {
                    return callback(null, false);
                }
            }
        });
    });
}

/**
 * @typedef ImageFields
 * @type {object}
 * @property {string} name - The name of the field.
 * @property {string} type - The type of the field.
 * @property {string} val - The string representation of the typed value.
 */

/**
 * Image metadata fields callback.
 * @callback imageFieldsCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {ImageFields} fields - All metadata fields set on the given image.
 */

/**
 * Retrieves all metadata fields set on an image.
 * @static
 * @param {string} iid - The id of the image to lookup.
 * @param {imageFieldsCallback} callback - The callback that handles the basic image metadata.
 */
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

/**
 * @typedef ImageAnnotations
 * @type {object}
 * @property {string} name - The name of the field.
 * @property {object} region - The object representation of the region, as provided by {@link geomWKTToPoints}.
 */

/**
 * Image annotation retrieval callback.
 * @callback imageAnnoCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {ImageAnnotations} fields - All annotations set on the given image.
 */

/**
 * Retrieves all annotations set on an image.
 * @static
 * @param {string} iid - The id of the image to lookup.
 * @param {imageAnnoCallback} callback - The callback that handles the image annotations.
 */
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

/**
 * @typedef Image
 * @type {object}
 * @property {string} imageid - The id of the image.
 * @property {Date} datetime - The time and date the picture was taken.
 * @property {object} loc - A lat/lon pair detailing where the image was taken.
 * @property {boolean} private - Whether the image should be viewable by other users or not.
 * @property {string} uploader - The email of the uploader of the image.
 */

/**
 * Image list callback.
 * @callback imagesCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {Image[]} images - The list of images associated with the user.
 */

/**
 * Retrieves the basic metadata for an image, checking that the user is allowed access.
 * @static
 * @param {user.User} user - The user to fetch images from.
 * @param {number} [uploader] - The email of the uploader to filter on, if provided.
 * @param {imagesCallback} callback - The callback that handles the image list.
 */
function getUserImages(user, uploader, callback) {
    var query = "SELECT `imageid`, `datetime`, AsText(`location`) AS 'loc', `private`, `email` AS 'uploader' FROM `images` INNER JOIN `users` ON `userid`=`uploaderid` WHERE `ownerid`=?";
    var sub = [user.id];
    if (uploader) {
        query += " AND `email`=?";
        sub.push(uploader);
    }
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
                // Convert all loc properties to object representation.
                res.forEach(function(img) {
                    if (_.isString(img.loc)) {
                        // Convert the given WKT string to a point object.
                        img.loc = geomWKTToPoints(img.loc, true);
                    }
                });
                callback(null, res);
            }
        });

        conn.release();
    });
}

/**
 * Gets the images based on some filters.
 * @static
 * @param {number} pid - The project to get images from.
 * @param {number} offset - The offset to begin listing images from.
 * @param {number} limit - The maximum number of images to return.
 * @param {imagesCallback} callback - The callback that handles the image list.
 */
function getImages(pid, offset, limit, callback) {
    var query = "SELECT `imageid`, `datetime`, AsText(`location`) AS 'loc', `private` FROM `images` WHERE `projectid`=? LIMIT ?,?";
    var sub = [pid, offset, limit];
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
                res.forEach(function(img) {
                    if (_.isString(img.loc)) {
                        // Convert the given WKT string to a point object.
                        img.loc = geomWKTToPoints(img.loc, true);
                    }
                });
                callback(null, res);
            }
        });

        conn.release();
    });
}

/**
 * Tries to add a new image for a given user.
 * @static
 * @param {user.User} user - The user who should be given ownership of the zip.
 * @param {number} project - The id of the project the image should be attached to.
 * @param {string} imageHash - The hash of the image, to use as the id.
 * @param {errorCallback} callback - The callback that handles the result of trying to add a new image.
 */
function addNewImage(user, project, imageHash, callback) {
    var query = "INSERT INTO `images` (imageid, projectid, uploaderid, ownerid) VALUE (?,?,?,?)";
    var sub = [ imageHash, project, user.id ];
    if (user.isSubuser()) {
        sub.push(user.supervisor);
    } else {
        sub.push(user.id);
    }
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback('Database error');
        }

        return conn.query(query, function(err, res) {
            conn.release();

            if (err) {
                console.log(err.code);
                return callback(err);
            } else {
                return callback();
            }
        });
    });
}

/**
 * User callback.
 * @callback userCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {user.User} user - The affected user.
 */

/**
 * Retrieves a user from it's id.
 * @static
 * @param {number} id - The id of the user to lookup.
 * @param {userCallback} callback - The callback that handles the found user.
 */
function getUser(id, done) {
    var query = "SELECT `email`, `name`, `usertype`, `gravatar`, `supervisor`, `assigned_project`" +
        "FROM `users` " +
        "WHERE `userid` = ?";

    var sub = [id];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            console.log(connErr);
            console.log(query);
            return done('Database error', false);
        }

        conn.query(query, function(err, res) {
            if (err) {
                console.log(err);
                done(err, false);
            } else {
                if (res.length === 0) {
                    done(null, false);
                } else {
                    var user = new User(id, res[0].name, res[0].email, User.prototype.typeFromString(res[0].usertype), res[0].gravatar, res[0].supervisor, res[0].assigned_project);
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

/**
 * Tries to add a new external authorization account to a given user.
 * @static
 * @param {string} id - The unique id of the external account.
 * @param {string} provider - A string that identifies the service providing the external account - e.g. "facebook"
 * @param {user.User} loginUser - The standard user who should be authorized by this external account.
 * @param {userCallback} done - The callback that handles the result of associating the account.
 */
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

/**
 * Retrieves a user from an external authorization attempt. If the user is already logged in, the external account will be associated with their current user, if possible.
 * @static
 * @param {string} id - The external account id to login with.
 * @param {string} provider - A string that identifies the service providing the external account - e.g. "facebook"
 * @param {user.User} [loginUser] - The currently logged in user, if they are logged in.
 * @param {userCallback} callback - The callback that handles the found or updated user.
 */
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
                        user = new User(res[0].userid, res[0].name, res[0].email, User.prototype.typeFromString(res[0].usertype), res[0].gravatar);
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
                        user = new User(res[0].userid, res[0].name, res[0].email, User.typeFromString(res[0].usertype), res[0].gravatar);
                        done(0, user);
                    }
                }
            }
        });

        conn.release();
    });
}

/**
 * Adds a password hash to an account to allow email/password authentication.
 * @static
 * @param {number} id - The user id to associate the password with.
 * @param {string} auth - The string representation of the bcrypt hash of the password.
 */
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

/**
 * Updates a password on an account and updates the user's token expiry.
 * @static
 * @param {string} email - The email of the user to update.
 * @param {string} auth - The string representation of the bcrypt hash of the password.
 * @param {boolean} token_expiry - Whether to set a new expiry or not. See {@link updateUser}.
 * @param {booleanCallback} callback - The callback that handles the update result.
 */
function updateUserHash(email, auth, token_expiry, callback) {
    var query = "UPDATE `local_auth` INNER JOIN `users` USING (`userid`) SET `local_auth`.`hash` = ? WHERE `users`.`email` = ?";
    var sub = [ auth, email ];

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            console.log(connErr);
            return callback('Database error', null);
        }

        query = mysql.format(query, sub);
        return conn.query(query, function(err, res) {
            conn.release();
            if (err) {
                // The query failed, respond to the error.
                console.log(err.code);
                return callback(err, null);
            } else {
                console.log(JSON.stringify(res));
                return updateUser(null, email, null, null, null, token_expiry, callback);
            }
        });
    });
}

/**
 * Tries to add a new user with a usertype of 'user'.
 * @static
 * @param {user.User} user - The user to create. The id and usertype properties will be ignored.
 * @param {string} [phash] - The string representation of the bcrypt hash of the user's password.
 * @param {string} [vhash] - The validation hash the user must return to verify their email.
 * @param {userCallback} callback - The callback that handles the result of trying to add a new user.
 */
function addNewUser(user, phash, vhash, callback) {
    if (!_.isString(vhash)) {
        // vhash not supplied, force it to null
        console.log('Creating user without email validation.');
        vhash = null;
    }

    var query = "INSERT INTO `users` (userid, email, name, usertype, gravatar, validation_hash) VALUE (null,?,?,?,?,?)";
    var sub = [user.email, user.name, "user", user.gravatar, vhash];
    query = mysql.format(query, sub);

    return connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback('Database error');
        }

        return conn.query(query, function(err, res) {
            conn.release();

            if (err) {
                console.log(err.code);
                return callback(err);
            } else {
                // Update the user object with it's new id.
                user.id = res.insertId;

                if (phash) {
                    // Only set the hash if one has been set.
                    setUserHash(res.insertId, phash);
                }

                return callback(null, user);
            }
        });
    });
}

/**
 * Tries to add a new subuser.
 * @static
 * @param {user.User} user - The user to create. The id and usertype properties will be ignored.
 * @param {string} phash - The string representation of the bcrypt hash of the user's password.
 * @param {userCallback} callback - The callback that handles the result of trying to add a new user.
 */
function addNewSub(user, phash, callback) {
    var query = "INSERT INTO `users` (`email`, `name`, `usertype`, `supervisor`, `token_expiry`, `assigned_project`) VALUE (?,?,?,?,(NOW()+INTERVAL 1 HOUR),?)";
    var sub = [user.email, user.name, User.prototype.Type.SUBUSER.i, user.supervisor, user.projectid];
    query = mysql.format(query, sub);

    return connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            return callback('Database error');
        }

        return conn.query(query, function(err, res) {
            conn.release();

            if (err) {
                console.log(err.code);
                return callback(err);
            } else {
                // Update the user object.
                user.id = res.insertId;
                setUserHash(user.id, phash);
                return callback(null, user);
            }
        });
    });
}

/**
 * Validates a user's email via the validation hash.
 * @static
 * @param {string} email - The email we are verifying.
 * @param {string} vhash - The validation hash to verify.
 * @param {booleanCallback} callback - The callback that handles the outcome of the validation.
 */
function validateEmail(email, vhash, callback) {
    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            console.log(connErr);
            return callback('Database error');
        }

        var query = "UPDATE `users` SET `validation_hash` = NULL WHERE `email` = ? AND `validation_hash` = ?";
        var sub = [ email, vhash ];
        query = mysql.format(query, sub);

        return conn.query(query, function(err, res) {
            conn.release();

            if (err) {
                console.log(err.code);
                return callback(err);
            } else {
                return callback(null, (res.changedRows === 1));
            }
        });
    });
}

/**
 * User and password hash callback.
 * @callback userHashCallback
 * @param {Error} err - The error that occurred, if present.
 * @param {string} hash - The string representation of the user's password hash.
 * @param {user.User} user - The user object.
 */

/**
 * Retrieves the user object and password hash corresponding to the given email.
 * @static
 * @param {string} email - The email of the user to lookup.
 * @param {userHashCallback} callback - The callback that handles the password hash comparison and user object.
 */
function getUserHash(email, callback) {
    var query = "SELECT `users`.`userid`, `name`, `email`, `hash`, `usertype`, `gravatar`, `supervisor`, `assigned_project` " +
        "FROM `users` " +
        "INNER JOIN `local_auth` USING (`userid`) " +
        "WHERE `email` = ?";
    var sub = [ email ];
    query = mysql.format(query, sub);

    connPool.getConnection(function(connErr, conn) {
        if (connErr) {
            console.log(connErr);
            return callback('Database error', false);
        }

        conn.query(query, function(err, res) {
            conn.release();

            if (err) {
                // The query failed, respond to the error.
                console.log(err);
                return callback(err, null, null);
            } else {
                if (res.length === 0) {
                    return callback(null, null, null);
                } else {
                    var user = new User(res[0].userid, res[0].name, res[0].email, User.prototype.typeFromString(res[0].usertype), res[0].gravatar, res[0].supervisor, res[0].assigned_project);
                    return callback(null, user, res[0].hash);
                }
            }
        });
    });
}

// Export all public members.
module.exports = {
    init: init,
    jobDone:jobDone,
    getJobs:getJobs,
    addJob:addJob,
    zipsForUser:zipsForUser,
    tcAddNewZip:tcAddNewZip,
    deleteImage:deleteImage,
    imageExists:imageExists,
    getImageFields:getImageFields,
    getProjects:getProjects,
    getFields:getFields,
    setFields:setFields,
    deleteFields:deleteFields,
    getProject:getProject,
    checkProjectAccess:checkProjectAccess,
    createProject:createProject,
    updateProject:updateProject,
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
    updateUserHash: updateUserHash,
    updateSubuser: updateSubuser,
    getSubusers: getSubusers,
    getImages: getImages
};

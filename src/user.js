/**
 * @module user
 */

var bcrypt = require('bcrypt-nodejs');
var validator = require('email-validator');
var errors = require('./error.js');
var _ = require('underscore');
var util = require('./util.js');
//var auth = require('./auth/auth.js');
var db = require('./db.js');

/**
 * Enum type detailing user types and their corresponding numeric and string representations.
 * @static
 */
var PrivilegeLevel = Object.freeze({
    SUBUSER: {
        i: 0,
        dbs: "subuser"
    },
    USER: {
        i: 1,
        dbs: "user"
    },
    RESEARCHER: {
        i: 2,
        dbs: "researcher"
    },
    ADMIN: {
        i: 3,
        dbs: "admin"
    }
});

/**
 * List representation of PrivilegeLevels, for convenience.
 */
var PLs = [PrivilegeLevel.SUBUSER, PrivilegeLevel.USER, PrivilegeLevel.RESEARCHER, PrivilegeLevel.ADMIN];

/**
 * Converts a privilege level string into it's integer value.
 * @static
 * @param {string} dbs - The string representation of the privilege level.
 * @returns {number} The numeric representation of the privilege level.
 */
function privilegeFromString(dbs) {
    var res = false;
    PLs.forEach(function(lvl) {
        if (dbs === lvl.dbs) {
            res = lvl.i;
        }
    });
    return res;
}

/**
 * Converts a privilege level integer value into it's string representation.
 * @static
 * @param {number} i - The numeric representation of the privilege level.
 * @returns {string} The string representation of the privilege level.
 */
function privilegeFromInt(i) {
    var res = false;
    PLs.forEach(function(lvl) {
        if (i === lvl.i) {
            res = lvl.dbs;
        }
    });
    return res;
}

/**
 * Represents a user of the service. If any of the required attributes are erroneous, the id will be 
 * set to false to indicate the error state. The object should be discarded in this case.
 * @constructor
 * @param {number} id - The id of the user.
 * @param {string} name - The display name of the user.
 * @param {string} email - The email of the user.
 * @param {number} privilege - The numeric representation of the user's privilege level.
 * @param {string} [gravatar] - The gravatar id - a 32 character hash of the gravatar email.
 * @param {string} [supervisor] - The id of the user's supervisor. Subusers only.
 * @param {number} [projectid] - The id of the project the user will be contributing to. Subusers only.
 */
function User(id, name, email, privilege, gravatar, supervisor, projectid) {
    if (typeof id !== 'number') {
        this.id = false;
        return;
    }
    if (typeof privilege !== 'number') {
        this.id = false;
        return;
    }
    if (privilege < 0 || privilege > 3) {
        this.id = false;
        return;
    }
    // May need to change if valid email addresses not being accepted
    if (validator.validate(email) !== true) {
        this.id = false;
        return;
    }
    if (privilege === PrivilegeLevel.SUBUSER.i) {
        // Subuser must have a valid supervisor id, which must not be their own.
        if (typeof supervisor !== 'number' || supervisor === id) {
            console.log(typeof supervisor + ' ' + supervisor);
            console.log('Tried to instantiate subuser with invalid supervisor.');
            this.id = false;
            return;
        } else {
            this.supervisor = supervisor;
        }

        // Subuser must have a valid projectid.
        if (typeof projectid !== 'number') {
            console.log(typeof projectid + ' ' + projectid);
            console.log('Tried to instantiate subuser with invalid projectid.');
            this.id = false;
            return;
        } else {
            this.projectid = projectid;
        }
       
    } else {
        this.supervisor = null;
        this.projectid = null; 
    }
    if (typeof gravatar !== 'string' || gravatar.length !== 32) {
        this.gravatar = null;
    } else {
        this.gravatar = gravatar;
    }

    this.id = id;
    this.name = name;
    this.email = email;
    this.privilege = privilege;
}

/**
 * Retrieves a URL for the user's profile image. This will be a gravtar URL, or a default placeholder.
 * @returns {string} The URL of the image to display.
 */
User.prototype.profileURL = function() {
    if (this.gravatar === null) {
        // TODO: Get the host programmatically or via config
        return 'http://citizen.science.image.storage.public.s3-website-eu-west-1.amazonaws.com/user.png';
    } else {
        return 'http://www.gravatar.com/avatar/' + this.gravatar;
    }
};

/**
 * Converts a user to JSON. Overrides the default implementation.
 * @returns {string} The JSON representation of the user.
 */
User.prototype.toJSON = function() {
    var json = {
        'id': this.id,
        'name': this.name,
        'email': this.email,
        'privilege': this.privilege,
        'profile_image': this.profileURL()
    };

    if (this.privilege === PrivilegeLevel.SUBUSER.i) {
        json.supervisor = this.supervisor;
        json.projectid = this.projectid;
    }

    return json;
};

/**
 * Checks if the user is a researcher.
 * @returns {boolean} Whether the user is a researcher.
 */
User.prototype.isResearcher = function() {
    if (this.privilege === PrivilegeLevel.RESEARCHER.i) {
        return true;
    }
    return false;
};

/**
 * Checks if the user is a subuser.
 * @returns {boolean} Whether the user is a subuser.
 */
User.prototype.isSubuser = function() {
    if (this.privilege === PrivilegeLevel.SUBUSER.i) {
        return true;
    }
    return false;
};

/**
 * Checks if the user is an admin.
 * @returns {boolean} Whether the user is an admin.
 */
User.prototype.isAdmin = function() {
    if (this.privilege === PrivilegeLevel.ADMIN.i) {
        return true;
    }
    return false;
};

/**
 * Represents a researcher in the system.
 * @constructor
 * @augments User
 * @param {object} groups - The groups the researcher is part of.
 */
function Researcher(name, email, groups) {
    User.call(this, name, email, 2);
    this.groups = groups;
}

/**
 * Registers Express routes related to user handling. These are API endpoints.
 * @static
 * @param {Express} app - The Express application object.
 */
function userRoutes(app, auth) { //TODO: Need to solve circular dependencies to stop this.
    /**
     * API endpoint to update a user. Various parameters are only valid dependent on the target user
     * and the privilege level of the requester.
     * @hbcsapi {PATCH} /users/:uid - This is an API endpoint.
     * @param {string} :uid - The email of the user to update. TODO: Take a numeric id.
     * @param {string} [name] - The new name to give the user. Only valid on self.
     * @param {string} [gravatar] - The gravatar hash to use as the user's profile image.
     * @param {number} [privilege] - The new privilege level to give the user. Only valid if requested by a researcher.
     * @returns {BasicAPIResponse} The API response signifying success or failure.
     */
    app.patch('/users/:uid', auth.enforceLoginCustom({'minPL':PrivilegeLevel.USER.i}), function(req, res) {
        if (req.params.uid) {
            var email = req.params.uid;
            if (email === req.user.email) {
                var name = req.body.name;
                var gravatar = req.body.gravatar;
                if (typeof name !== "string" || name.length <= 1) {
                    return res.send(new errors.APIErrResp(2, 'Invalid name'));
                }
                return db.updateUser(name, email, null, gravatar, null, null, function(err, info){
                    if (err) {
                        console.log(err);
                        return res.send(new errors.APIErrResp(3, 'Update failed'));
                    } else if(info) {
                        return res.send({
                            'res': true
                        });
                    } else {
                        return res.send(new errors.APIErrResp(4, 'Nothing to update'));
                    }
                });
            } else if (req.user.privilege === PrivilegeLevel.RESEARCHER.i) {
                var level = parseInt(req.body.privilege);
                console.log("level: " + level);
                if (!_.isNaN(level) && (level === 1 || level === 2)) {
                    var privilege = privilegeFromInt(level);
                    console.log('priv: ' + privilege);
                    return db.updateUser(null, email, privilege, null, null, null, function(err, info){
                        if(err) {
                            console.log(err);
                            return res.send(new errors.APIErrResp(3, 'Update failed'));
                        } else if(info) {
                            return res.send({
                                'res': true,
                                'msg': 'success'
                            });
                        } else {
                            return res.send(new errors.APIErrResp(5, 'Invalid email'));
                        }
                    });
                } else {
                    return res.send(new errors.APIErrResp(6, 'Invalid privilege'));
                }
            } else {
                return res.send(new errors.APIErrResp(1, 'Insufficient Privilege'));
            }
        } else {
            return res.send(new errors.APIErrResp(5, 'Invalid email'));
        }
    }); 

    /**
     * API endpoint to update a subuser.
     * @hbcsapi {PATCH} /subusers/:uid - This is an API endpoint.
     * @param {string} :uid - The email of the subuser to update. TODO: Take numeric id.
     * @param {string} [name] - The new name to give the user. Only valid on self.
     * @param {boolean} [refresh] - Whether to refresh the user's validation token.
     * @param {number} [projectid] - The project id to assign the subuser to.
     * @returns {BasicAPIResponse} - The API response indicating the outcome.
     */
    app.patch('/subusers/:uid', auth.enforceLogin, function(req, res) {
        var email = req.params.uid;
        var name = req.body.name;
        var refresh = req.body.refresh;
        var projectid = req.body.projectid;
        var result1 = true;
        if (projectid) {
            projectid = parseInt(projectid);
            if (_.isNaN(projectid)) {
                return res.send(new errors.APIErrResp(3, 'Invalid project id.'));
            }
        }
        // Sanitise refresh input.
        if (!_.isBoolean(refresh)) {
            console.log('Ignoring refresh.');
            refresh = null;
        }
        if (email) {
            if (refresh === false) {
                console.log('new token');
                var hash = util.getRandomHash();
                return util.newToken(email, hash, db, function(er, re){
                    if (er) {
                        return res.send(new errors.APIErrResp(2, 'Database error.'));
                    } else if (!re) {
                        console.log(re);
                        return res.send(new errors.APIErrResp(3, 'Cannot invalidate this subuser.'));
                    } else if (name || projectid) {
                        return db.updateSubuser(req.user.id, email, name, refresh, projectid, function(err, r) {
                            if (err) {
                                console.log(err);
                                return res.send(new errors.APIErrResp(2, 'Database error.'));
                            } else if (r) {
                                result1 = false;
                                return res.send({
                                    'res': true
                                });
                            } else {
                                console.log("false");
                                return res.send(new errors.APIErrResp(3, 'Invalidation successful but name change may have failed.'));
                            }
                        });
                    } else {
                        return res.send({
                            'res': true
                        });
                    }
                });
            } else if (name || projectid || refresh) {
                return db.updateSubuser(req.user.id, email, name, refresh, projectid, function(err, r) {
                    if (err) {
                        console.log(err);
                        return res.send(new errors.APIErrResp(2, 'Database error.'));
                    } else if (r) {
                        result1 = false;
                        return res.send({
                            'res': true
                        });
                    } else {
                        console.log("false");
                        return res.send(new errors.APIErrResp(3, 'Invalid parameters'));
                    }
                });
            } else {
                console.log('re '+result1);
                return res.send(new errors.APIErrResp(3, 'Invalid parameters'));
            }

        } else {
            return res.send(new errors.APIErrResp(3, 'Invalid parameters'));
        }
    }); 

    /**
     * @typedef SubusersAPIResponse
     * @type {object}
     * @property {boolean} res - True iff the operation succeeded, regardless of the number of subusers.
     * @property {APIError} [err] - The error that cause the request to fail.
     * @property {object[]} [subusers] - The list of subusers. TODO: specify details
     */

    /**
     * API endpoint to get a list of subusers belonging to the account.
     * @hbcsapi {GET} subusers - This is an API endpoint.
     * @returns {SubusersAPIResponse} - The API response indicating the outcome.
     */
    app.get('/subusers', auth.enforceLogin, function(req, res){
        if(req.user.privilege > 1 ) {
            return db.getSubusers(req.user.id, function(err, info){
                if(err){
                    console.log(err);
                    return res.send(new errors.APIErrResp(2, 'Database error.'));
                } else {
                    return res.send({
                        'res': true,
                        'subusers': info
                    });
                }
            });
            
        } else {
            return res.send(new errors.APIErrResp(3, 'Insufficient Privilege.'));
        }
    }); 

}

// Export all public members.
module.exports = {
    PrivilegeLevel: PrivilegeLevel,
    User: User,
    Researcher: Researcher,
    privilegeFromString: privilegeFromString,
    privilegeFromInt: privilegeFromInt,
    userRoutes: userRoutes
};

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
var User = require('./models/User.js');

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
    app.patch('/users/:uid', auth.enforceLoginCustom({'minPL':'user'}), function(req, res) {
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
            } else if (req.user.isResearcher()) {
                var level = parseInt(req.body.privilege);
                console.log("level: " + level);
                if (!_.isNaN(level) && (level === 1 || level === 2)) {
                    var privilege = User.prototype.privilegeFromInt(level);
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
    Researcher: Researcher,
    userRoutes: userRoutes
};

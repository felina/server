var crypto = require('crypto');
var bcrypt = require('bcrypt-nodejs');
var validator = require('email-validator');
var errors = require('./error.js');
var loauth = require('./auth/localauth.js');
var _ = require('underscore');

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

var PLs = [PrivilegeLevel.SUBUSER, PrivilegeLevel.USER, PrivilegeLevel.RESEARCHER, PrivilegeLevel.ADMIN];

function newToken(email, password, db, callback) {
    bcrypt.hash(password, null, null, function(err, hash) {
        if (err) {
            console.log('Failed to hash password');
            console.log(err);
            callback(err, null);
        } else {
            db.updateUserHash(email, hash, -1, function(e, r) {
                if (e) {
                    console.log('database error');
                    callback(e, null);
                } else {
                    callback(null, r);
                }
            });
        }
    });
}

function privilegeFromString(dbs) {
    var res = false;
    PLs.forEach(function(lvl) {
        if (dbs === lvl.dbs) {
            res = lvl.i;
        }
    });
    return res;
}

function privilegeFromInt(i) {
    var res = false;
    PLs.forEach(function(lvl) {
        if (i === lvl.i) {
            res = lvl.dbs;
        }
    });
    return res;
}

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
            this.supervisor = supervisor;
            this.projectid = projectid;
        }
       
    } else {
        this.supervisor = null;
        this.projectid = null; 
    }
    if (typeof gravatar !== 'string' || gravatar.length !== 32) {
        this.gravatar = null;
    }

    this.id = id;
    this.name = name;
    this.email = email;
    this.privilege = privilege;
    this.gravatar = gravatar;
}

User.prototype.profileURL = function() {
    if (this.gravatar === null) {
        // TODO: Get the host programmatically or via config
        return 'http://citizen.science.image.storage.public.s3-website-eu-west-1.amazonaws.com/user.png';
    } else {
        return 'http://www.gravatar.com/avatar/' + this.gravatar;
    }
};

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
    }

    return json;
};

User.prototype.isResearcher = function() {
    if (this.privilege === PrivilegeLevel.RESEARCHER) {
        return true;
    }
    return false;
};

User.prototype.isAdmin = function() {
    if (this.privilege === PrivilegeLevel.ADMIN.i) {
        return true;
    }
    return false;
};

function Researcher(name, email, groups) {
    User.call(this, name, email, 2);
    this.groups = groups;
}

function userRoutes(app, auth, db) {
    // For updating fields e.g. email, gravatar, privilege level...
    app.patch('/user', auth.enforceLogin, function(req, res) {
        console.log(JSON.stringify(req.body));
        console.log(JSON.stringify(req.user));
        if(req.body.email) {
            var email = req.body.email;
            if(req.body.email===req.user.email) {
                var name = req.body.name;
                if(typeof name !== "string" || name.length <= 1) {
                    return res.send(new errors.APIErrResp(2, 'Invalid name'));
                }
                db.updateUser(name,email,null,null,null,null, function(err, info){
                    if(err) {
                        console.log(err);
                        res.send(new errors.APIErrResp(3, 'Update failed'));
                    } else if(info) {
                        res.send({
                            'res': true
                        });
                    } else {
                        return res.send(new errors.APIErrResp(4, 'Nothing to update'));
                    }
                });
            } else if(req.user.privilege === PrivilegeLevel.RESEARCHER.i) {
                var level = parseInt(req.body.privilege);
                console.log("level: "+ level);
                if(!_.isNaN(level) && (level === 1 || level === 2)) {
                    var privilege = privilegeFromInt(level);
                    console.log('priv: '+privilege);
                    db.updateUser(null,email, privilege, null, null, null, function(err, info){
                        if(err) {
                            console.log(err);
                            res.send(new errors.APIErrResp(3, 'Update failed'));
                        } else if(info) {
                            res.send({
                                'res': true
                            });
                        } else {
                            return res.send(new errors.APIErrResp(5, 'Invalid email'));
                        }
                    });
                } else {
                    res.send(new errors.APIErrResp(6, 'Invalid privilege'));
                }
            } else {
                res.send(new errors.APIErrResp(1, 'Insufficient Privilege'));
            }
        } else {
            res.send(new errors.APIErrResp(5, 'Invalid email'));
        }
    }); 

    // update subusers details
    app.patch('/subuser', auth.enforceLogin, function(req, res) {
        var name = req.body.name;
        var email = req.body.email;
        var refresh = parseInt(req.body.refresh);
        var result1 = true;
        if (email) {
            if(refresh === -1) {
                console.log('new token');
                var hash = loauth.getValidationHash();
                newToken(email, hash, db, function(er, re){
                    if(er) {
                        return res.send(new errors.APIErrResp(2, 'database error'));
                    } else if (!re) {
                        console.log(re);
                        return res.send(new errors.APIErrResp(3, 'Cannot invalidate this subuser.'));
                    } else if (name) {
                        db.updateSubuser(req.user.id, email, name, refresh, function(err, r) {
                            if (err) {
                                console.log(err);
                                return res.send(new errors.APIErrResp(2, 'database error'));
                            } else if(r) {
                                console.log("true man");
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
            } else if(name || refresh === 1) {
                db.updateSubuser(req.user.id, email, name, refresh, function(err, r) {
                    if (err) {
                        console.log(err);
                       return res.send(new errors.APIErrResp(2, 'database error'));
                    } else if(r) {
                        console.log("true man");
                        result1 = false;
                        return res.send({
                            'res':true
                        });
                    } else {
                        console.log("false");
                        return res.send(new errors.APIErrResp(3, 'Invalid parameters'));
                    }
                });
            } else {
                console.log('re '+result1);
               res.send(new errors.APIErrResp(3, 'Invalid parameters'));
            }

        } else {
            res.send(new errors.APIErrResp(3, 'Invalid parameters'));
        }
    });

    app.get('/subuser', auth.enforceLogin, function(req, res){
        if(req.user.privilege > 1 ) {
            db.getSubusers(req.user.id, function(err, info){
                if(err){
                    console.log(err);
                    res.send(new errors.APIErrResp(2, 'Database error'));
                } else {
                    res.send({
                        'res': true,
                        'subusers': info
                    });
                }
            });
            
        } else {
            res.send(new errors.APIErrResp(3, 'Insufficient Privilege'));
        }
    }); 

}

module.exports = {
    PrivilegeLevel: PrivilegeLevel,
    User: User,
    Researcher: Researcher,
    privilegeFromString: privilegeFromString,
    privilegeFromInt: privilegeFromInt,
    userRoutes: userRoutes
};

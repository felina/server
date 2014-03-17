var crypto = require('crypto');
var bcrypt = require('bcrypt-nodejs');
var validator = require('email-validator');
var errors = require('./error.js');
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

var PLs = [PrivilegeLevel.USER, PrivilegeLevel.RESEARCHER, PrivilegeLevel.ADMIN];

function getValidationHash() {
    var md5 = crypto.createHash('md5');
    var str = '';
    var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (var i=0; i<=10; i++) {
        str += chars[Math.round(Math.random() * (chars.length - 1))];
    }
    md5.update(str);
    return md5.digest('hex');
}

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

function User(id, name, email, privilege, gravatar) {
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
        // TODO:
        return 'http://nl.ks07.co.uk:5000/user.png';
    } else {
        return 'http://www.gravatar.com/avatar/' + this.gravatar;
    }
};

User.prototype.toJSON = function() {
    return {
        'id': this.id,
        'name': this.name,
        'email': this.email,
        'privilege': this.privilege,
        'profile_image': this.profileURL()
    };
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
                    return res.send(new errors.APIErrResp(2, 'invalid name'));
                }
                db.updateUser(name,email,null,null,null,null, function(err, info){
                    if(err) {
                        console.log(err);
                        res.send({'res':false, 'err':{'code':1, 'msg':'update failed'}});
                    } else if(info) {
                        res.send({'res':true, 'msg':'Update successful'});
                    } else {
                        return res.send({'res':false, 'err':{'code':1, 'msg':'nothing to update'}});
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
                            res.send({'res':false, 'err':{'code':1, 'msg':'update failed'}});
                        } else if(info) {
                            res.send({'res':true, 'msg':'Update successful'});
                        } else {
                            return res.send({'res':false, 'err':{'code':1, 'msg':'invalid email'}});
                        }
                    });
                } else {
                    res.send(new errors.APIErrResp(2, 'Invalid privilege'));
                }
            } else {
                res.send(new errors.APIErrResp(2, 'Insufficient Privilege'));
            }
        } else {
            res.send(new errors.APIErrResp(2, 'Invalid email'));
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
                var hash = getValidationHash();
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
                                return res.send({'res':true, 'msg':'success'});
                            } else {
                                console.log("false");
                                return res.send(new errors.APIErrResp(3, 'Invalidation successful but name change may have failed.'));
                            }
                        });
                    } else {
                        return res.send({'res': true, 'msg':'success'});
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
                        return res.send({'res':true, 'msg':'success'});
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
                    res.send({'res':true, 'subusers':info});
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
    userRoutes: userRoutes
};

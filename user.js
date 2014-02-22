var validator = require('email-validator');

var PrivilegeLevel = Object.freeze({
    USER        : { i:1, dbs:"user" },
    RESEARCHER  : { i:2, dbs:"researcher" },
    ADMIN       : { i:3, dbs:"admin" }
});

var PLs = [PrivilegeLevel.USER, PrivilegeLevel.RESEARCHER, PrivilegeLevel.ADMIN];

function privilegeFromString(dbs) {
    var res = false;
    PLs.forEach(function (lvl) {
        if (dbs === lvl.dbs) {
            res = lvl.i;
        }
    });
    return res;
}

function User (id, name, email, privilege) {
    if (typeof id !== 'number') {
	this.id = false;
	return;
    }
    if (typeof privilege !== 'number') {
	this.id = false;
	return;
    }
    if (privilege < 1 || privilege > 3 ) {
        this.id = false;
	return;
    }
    // May need to change if valid email addresses not being accepted
    if (validator.validate(email) !== true) {
        this.id = false;
	return;
    }
    this.id = id;
    this.name = name;
    this.email = email;
    this.privilege = privilege;
}

User.prototype.isResearcher = function() {
    if (this.privilege === PrivilegeLevel.RESEARCHER) {
        return true;
    }
    return false;
}

User.prototype.isAdmin = function() {
    if (this.privilege === PrivilegeLevel.ADMIN) {
        return true;
    }
    return false;
}

function Researcher (name, email, groups) {
    User.call(this, name, email, 2);
    this.groups = groups;
}

function userRoutes(app, db) {
    // app.put('/user')
    // For updating fields e.g. email, gravatar, privilege level...
}

module.exports = {PrivilegeLevel:PrivilegeLevel, User:User, Researcher:Researcher, privilegeFromString:privilegeFromString, userRoutes:userRoutes};

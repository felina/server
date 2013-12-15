var validator = require('email-validator');

var PrivilegeLevel = Object.freeze({
	USER        : { i:1, dbs:"user" },
    RESEARCHER  : { i:2, dbs:"researcher" },
    ADMIN       : { i:3, dbs:"admin" }
});

function privilegeFromString(dbs) {
    for (var level in PrivilegeLevel) {
        if (dbs === level.dbs) {
            return level.i;
        }
    }
    
    return false;
}

function User (id, name, email, privilege) {
	if (typeof id !== 'number') {
		throw new Error("Id given is not a number");
	}
    if (typeof privilege !== 'number') {
        throw new Error("Privilege given is not a number");
    }
    if (privilege < 1 || privilege > 3 ) {
        throw new Error("Privilege level is out of bounds");
    }
    // May need to change if valid email addresses not being accepted
    if (validator.validate(email) !== true) {
        throw new Error("Email is not valid");
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

module.exports = {PrivilegeLevel:PrivilegeLevel, User:User, Researcher:Researcher, privilegeFromString:privilegeFromString};

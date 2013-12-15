// 1 == USER
// 2 == RESEARCHER
// 3 == ADMIN


var validator = require('email-validator');

function User (name, email, privilege) {
    if (typeof privilege !== 'number') {
        throw new Error("Privelege given is not a number");
    }
    if (privilege < 1 || privilege > 3 ) {
        throw new Error("Privelage level is out of bounds");
    }
    // May need to change if valid email addresses not being accepted
    if (validator.validate(email) !== true) {
        throw new Error("Email is not valid");
    }
    this.name = name;
    this.email = email;
    this.privilege = privilege;
}

User.prototype.isAdmin = function() {
    if (this.privilege === 3) {
        return true;
    }
    return false;
}

function Researcher (name, email, groups) {
    User.call(this, name, email, 2);
    this.groups = groups;
}

module.exports = {User:User, Researcher:Researcher};
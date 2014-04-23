/**
 * @module User
 */

var validator = require('email-validator');

/**
 * Represents a user of the service. If any of the required attributes are erroneous, the id will be 
 * set to false to indicate the error state. The object should be discarded in this case.
 * @constructor
 * @alias module:User
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
    if (privilege === this.Type.SUBUSER.i) {
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
 * Enum type detailing user types and their corresponding numeric and string representations.
 */
User.prototype.Type = Object.freeze({
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
User.prototype.Types = [
    User.prototype.Type.SUBUSER,
    User.prototype.Type.USER,
    User.prototype.Type.RESEARCHER,
    User.prototype.Type.ADMIN
];

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

    if (this.privilege === this.Type.SUBUSER.i) {
        json.supervisor = this.supervisor;
        json.projectid = this.projectid;
    }

    return json;
};

/**
 * Checks if the user is a given type, from a string.
 * @param {string} type - The string representation of the user type.
 * @param {boolean} min - If true, return true if the user is equal to or above the given type.
 * @returns {boolean} Whether the user is of the given type.
 */
User.prototype.isType = function(type, min) {
    type = User.prototype.typeFromString(type);
    if (type === false) {
        throw new Error('Invalid user type check.');
    } else if (min && this.privilege >= type) {
        return true;
    } else {
        return (this.privilege === type);
    }
};

/**
 * Checks if the user is a researcher.
 * @param {boolean} min - If true, return true if the user is an admin or researcher.
 * @returns {boolean} Whether the user is a researcher.
 */
User.prototype.isResearcher = function(min) {
    if (min && this.privilege >= this.Type.RESEARCHER.i) {
        return true;
    } else {
        return (this.privilege === this.Type.RESEARCHER.i);
    }
};

/**
 * Checks if the user is a subuser.
 * @param {boolean} min - If true, return true if the user is a subuser or above.
 * @returns {boolean} Whether the user is a subuser.
 */
User.prototype.isSubuser = function(min) {
    if (min && this.privilege >= this.Type.SUBUSER.i) {
        return true;
    } else {
        return (this.privilege === this.Type.SUBUSER.i);
    }
};

/**
 * Checks if the user is a standard user.
 * @param {boolean} min - If true, return true if the user is a standard user or above.
 * @returns {boolean} Whether the user is a standard user.
 */
User.prototype.isUser = function(min) {
    if (min && this.privilege >= this.Type.USER.i) {
        return true;
    } else {
        return (this.privilege === this.Type.USER.i);
    }
};

/**
 * Checks if the user is an admin.
 * @returns {boolean} Whether the user is an admin.
 */
User.prototype.isAdmin = function() {
    if (this.privilege === this.Type.ADMIN.i) {
        return true;
    }
    return false;
};

/**
 * Converts a privilege level string into it's integer value.
 * @param {string} dbs - The string representation of the privilege level.
 * @returns {number} The numeric representation of the privilege level.
 */
User.prototype.typeFromString = function(dbs) {
    var res = false;
    User.prototype.Types.forEach(function(lvl) {
        if (dbs === lvl.dbs) {
            res = lvl.i;
        }
    });
    return res;
};

/**
 * Converts a privilege level integer value into it's string representation.
 * @param {number} i - The numeric representation of the privilege level.
 * @returns {string} The string representation of the privilege level.
 */
User.prototype.typeFromInt = function(i) {
    var res = false;
    User.prototype.Types.forEach(function(lvl) {
        if (i === lvl.i) {
            res = lvl.dbs;
        }
    });
    return res;
};

// Export the constructor as the module.
module.exports = User;

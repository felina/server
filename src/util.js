/**
 * @module util
 */

var bcrypt = require('bcrypt-nodejs');
var crypto = require('crypto');
var db = require('./db.js');

/**
 * Generates a random hexadecimal string.
 * @static
 * @returns {string} A random hexadecimal string.
 */
module.exports.getRandomHash = function() {
    var md5 = crypto.createHash('md5');
    var str = '';
    var chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (var i=0; i<=10; i++) {
        str += chars[Math.round(Math.random() * (chars.length - 1))];
    }
    md5.update(str);
    return md5.digest('hex');
};


/**
 * Updates a user's account with a new password.
 * @static
 * @param {string} email - The email that identifies the user.
 * @param {string} password - The plaintext password to hash and store.
 * @param {updateSubuserCallback} callback - The callback that handles the update result.
 */
// TODO: May be able to move to user/auth.
module.exports.newToken = function(email, password, callback) {
    return bcrypt.hash(password, null, null, function(err, hash) {
        if (err) {
            console.log(err);
            return callback(err);
        } else {
            return db.updateUserHash(email, hash, false, function(e, r) {
                if (e) {
                    console.log(e);
                    return callback(e);
                } else {
                    return callback(null, r);
                }
            });
        }
    });
};

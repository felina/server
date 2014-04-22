/**
 * @module util
 */

var crypto = require('crypto');

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

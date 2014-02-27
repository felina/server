// Convenience function to create an error to send to the client.
module.exports.APIError = function(code, msg) {
    this.code = code;
    this.msg = msg;
}

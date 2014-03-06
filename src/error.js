function APIErrResp(code, msg) {
    this.res = false;
    this.err = new APIError(code, msg);
}

// Convenience function to create an error to send to the client.
function APIError(code, msg) {
    this.code = code;
    this.msg = msg;
}

module.exports = {APIErrResp:APIErrResp, APIError:APIError};

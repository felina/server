/**
 * @module errors
 */

/**
 * Represents an error as represented in the API.
 * @constructor
 * @param {number} code - An integer representing the error.
 * @param {string} msg - An error message to provide further detail to the client.
 */
function APIError(code, msg) {
    this.code = code;
    this.msg = msg;
}

/**
 * Represents an API response in an error state. Should be sent as-is to the client as JSON.
 * @constructor
 * @param {number} code - An integer representing the error.
 * @param {string} msg - An error message to provide further detail to the client.
 */
function APIErrResp(code, msg) {
    this.res = false;
    this.err = new APIError(code, msg);
}

// Export public members.
module.exports = {
    APIErrResp:APIErrResp,
    APIError:APIError
};

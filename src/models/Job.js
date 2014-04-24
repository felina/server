/**
 * @module Job
 */

var _ = require('underscore');

/**
 * A format string detailing how to invoke the executable within the zip for a given job.
 * The string should represent the command line that would run the executable file in the current directory.
 * Any variable parameters are delimited by '%' characters, e.g. '%imageA%'.
 * Allowed parameters are:
 *   - imageA = The path to the 'a' image.
 *   - imageB = The path to the 'b' image.
 * @typedef CmdString
 * @type {string}
 */

/**
 * @typedef WorkImage
 * @type {object}
 * @property {string} bucket - The bucket in which the image can be found.
 * @property {string} id - The id of the image, which will also be it's key.
 */

/**
 * @typedef WorkUnit
 * @type {object}
 * @property {WorkImage} a - Details of the first image in a pair.
 * @property {WorkImage} b - Details of the second image in a pair.
 */

/**
 * Represents a Job to be processed by a work server.
 * @constructor
 * @alias module:Job
 * @param {number} id - The unique id of the job.
 * @param {number} zip - The unique id of the zip that holds the executables required for this job.
 * @param {CmdString} cmd - The command line format string that gives the command needed to run the job.
 * @param {WorkUnit[]} work - The image pairs the job should be performed on.
 */
function Job(id, zip, cmd, work) {
    if (!_.isNumber(id)) {
        this.id = false;
        console.log('Job has invalid id.');
        return;
    }
    if (!_.isNumber(zip) || zip < 0) {
        this.id = false;
        console.log('Job has invalid zip.');
        return;
    }
    if (!_.isString(cmd) || cmd.length === 0) {
        this.id = false;
        console.log('Job has invalid cmd.');
        return;
    }

    this.id = id;
    this.zip = zip;
    this.cmd = cmd;
    this.work = work;
}

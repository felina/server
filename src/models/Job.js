/**
 * @module Job
 */

var _ = require('underscore');

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
 * @param {string} cmd - The name of the executable file within the zip to run.
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

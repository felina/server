/**
 * @module Project
 */

/**
 * Represents a project (also known as a 'species') in the system. The id will be set to false in case of
 * erroneous parameters. The object should be discarded if this is the case.
 * @constructor
 * @alias module:Project
 * @param {number} id - The id of the project.
 * @param {string} name - The display name of the project.
 * @param {string} desc - A short description of the project, to display.
 * @param {boolean} active - Whether the project should be considered active, open to contributions and visible.
 */
function Project(id, name, desc, active) {
    if (typeof id !== 'number') {
        this.id = false;
        console.log('Project has invalid id.');
        return;
    }
    if (typeof name !== 'string' || name.length > this.NAME_LENGTH) {
        this.id = false;
        console.log('Project given invalid name.');
        return;
    }
    if (typeof desc !== 'string' || desc.length > this.DESC_LENGTH) {
        this.id = false;
        console.log('Project given invalid description.');
        return;
    }
    this.id = id;
    this.name = name;
    this.desc = desc;
    this.active = active;
}


/**
 * The maximum length of a project name.
 */
Project.prototype.NAME_LENGTH = 45;

/**
 * The maximum length of a project description.
 */
Project.prototype.DESC_LENGTH = 255;

// Export the constructor as the module.
module.exports = Project;

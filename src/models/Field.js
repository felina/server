/**
 * @module Field
 */

var _ = require('underscore');
var Project = require('./Project.js');

/**
 * Represents a Field defined on a project.
 * @constructor
 * @alias module:Field
 * @param {number} id - The unique id of the field.
 * @param {number|Project} project - The project (or it's unique id) that this Field is part of.
 * @param {string} name - The display name of this field.
 * @param {string} type - The name of the type of field. Must be a member of {@link FIELD_TYPES} or {@link ANNO_TYPES}.
 * @param {boolean} required - If true, this field must be recorded for every image.
 */
function Field(id, project, name, type, required) {
    if (!_.isNumber(id)) {
        this.id = false;
        console.log('Field has invalid id.');
        return;
    }
    if (!_.isString(name) || name.length > this.NAME_LENGTH) {
        this.id = false;
        console.log('Field has invalid name.');
        return;
    }
    if (Field.prototype.TYPES.indexOf(type) < 0 && Field.prototype.ANNO_TYPES.indexOf(type) < 0) {
        this.id = false;
        console.log('Field has invalid type.');
        return;
    }
    if (!_.isBoolean(required)) {
        this.id = false;
        console.log('Field has invalid required.');
        return;
    }
    if (_.isNumber(project)) {
        this.pid = project;
    } else if (project instanceof Project) {
        this.project = project;
        this.pid = project.id;
    } else {
        this.id = false;
        console.log('Field has invalid project.');
        return;
    }

    this.id = id;
    this.name = name;
    this.type = type;
    this.required = required;
}

/**
 * The maximum length of a field name.
 */
Field.prototype.NAME_LENGTH = 45;

/**
 * The supported types of a field.
 */
Field.prototype.TYPES = [
    'enum',
    'string',
    'number'
];

/**
 * The supported types of an annotation, as represented internally.
 */
Field.prototype.ANNO_TYPES = [
    'apoly',
    'arect',
    'apoint'
];

/**
 * Converts an annotation type to it's display name (shape).
 * @returns {string} The shape representation of the type. Defaults to generic poly in case of unrecognised input.
 */
Field.prototype.typeToShape = function() {
    switch(this.type) {
    case 'arect':
        return 'rect';
    case 'apoint':
        return 'point';
    default:
        // apoly, or any erroneous input should be the most generic poly.
        return 'poly';
    }
};

/**
 * Converts the display name of an annotation to it's type name.
 * @param {string} shape - The display name of the type.
 * @returns {string} The type name of the shape. Defaults to generic poly in case of unrecognised input.
 */
Field.prototype.shapeToType = function(shape) {
    switch(shape) {
    case 'rect':
        return 'arect';
    case 'point':
        return 'apoint';
    case 'poly':
        return 'apoly';
    default:
        return null;
    }
};

// Export the constructor as the module.
module.exports = Field;

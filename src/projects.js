/**
 * @module projects
 */

var _ = require('underscore');
var errors = require('./error.js');
var users = require('./user.js');

/**
 * The maximum length of a project name.
 */
var NAME_LENGTH = 45;

/**
 * The maximum length of a project description.
 */
var DESC_LENGTH = 255;

/**
 * Represents a project (also known as a 'species') in the system. The id will be set to false in case of
 * erroneous parameters. The object should be discarded if this is the case.
 * @constructor
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
    if (typeof name !== 'string' || name.length > NAME_LENGTH) {
        this.id = false;
        console.log('Project given invalid name.');
        return;
    }
    if (typeof desc !== 'string' || desc.length > DESC_LENGTH) {
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
 * The maximum length of a field name.
 */
var FIELD_NAME_LENGTH = 45;

/**
 * The supported types of a field.
 */
var FIELD_TYPES = ['enum', 'string', 'number'];

/**
 * The supported types of an annotation, as represented internally.
 */
var ANNO_TYPES = ['apoly', 'arect', 'apoint'];

/**
 * Converts an annotation type to it's display name (shape).
 * @param {string} type - The internal type of an annotation. See {@link ANNO_TYPES}.
 * @returns {string} The shape representation of the type. Defaults to generic poly in case of unrecognised input.
 */
function typeToShape(type) {
    switch(type) {
    case 'arect':
        return 'rect';
    case 'apoint':
        return 'point';
    default:
        // apoly, or any erroneous input should be the most generic poly.
        return 'poly';
    }
}

/**
 * Converts the display name of an annotation to it's type name.
 * @param {string} shape - The display name of the type.
 * @returns {string} The type name of the shape. Defaults to generic poly in case of unrecognised input.
 */
function shapeToType(shape) {
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
}

/**
 * @typedef FieldParseError
 * @type {object}
 * @property {string} [part=''] - The section the first error was found in, if present.
 * @property {number} [i=-1] - The index of the erroneous field within the supplied part, if present.
 */

/**
 * Parses and validates field definitions.
 * @param {object[]} fieldList - The list of field definitions for a project.
 * @param {object[]} annoList - The list of annotation definitions for a project.
 * @returns {FieldParseError} The details of the first error found in the definitions, if any exist.
 */
function parseFields(fieldList, annoList) {
    var errIdx = -1;
    var errList = '';

    // Check every field definition, breaking out of the loop if an error is found.
    fieldList.every(function(f, i) {
        if (_.isObject(f)) {
            // Array item is an object (or list), check it's properties.
            if (typeof f.name !== 'string' || f.name.length < 1 || f.name.length > FIELD_NAME_LENGTH) {
                console.log('Bad field name.');
                errIdx = i;
                errList = 'fields';
                return false;
            }
            if (typeof f.type !== 'string' || FIELD_TYPES.indexOf(f.type) < 0) {
                console.log('Bad field type.');
                errIdx = i;
                errList = 'fields';
                return false;
            }
            if (f.type === 'enum' && (!_.isArray(f.enumvals) || f.enumvals.length < 1)) {
                console.log("Bad enumvals.");
                errIdx = i;
                errList = 'fields';
                return false;
            }
            if (typeof f.required !== 'boolean' && typeof f.required !== 'number') {
                console.log('Bad required flag.');
                errIdx = i;
                errList = 'fields';
                return false;
            }
            return true;
        } else {
            errIdx = i;
            errList = 'fields';
            return false;
        }
    });

    // Skip checking annotations if fields are invalid.
    if (errIdx === -1) {
        annoList.every(function(f, i) {
            if (_.isObject(f)) {
                // Array item is an object (or list), check it's properties.
                if (typeof f.name !== 'string' || f.name.length < 1 || f.name.length > FIELD_NAME_LENGTH) {
                    console.log('Bad name.');
                    errIdx = i;
                    errList = 'anno';
                    return false;
                }
                f.type = shapeToType(f.shape);
                if (f.type === null) {
                    console.log('Bad type.');
                    errIdx = i;
                    errList = 'anno';
                    return false;
                }
                if (typeof f.required !== 'boolean' && typeof f.required !== 'number') {
                    console.log('Bad required flag.');
                    errIdx = i;
                    errList = 'anno';
                    return false;
                }
                return true;
            } else {
                errIdx = i;
                errList = 'anno';
                return false;
            }
        });
    }

    return {
        'part': errList,
        'i': errIdx
    };  
}

/** Registers Express routes related to project handling. These are API endpoints.
 * @static
 * @param {Express} app - The Express application object.
 * @param {object} auth - The auth module.
 * @param {object} db - The db module.
 */
function projectRoutes(app, auth, db) {

    /**
     * @typedef ProjectListAPIResponse
     * @type {object}
     * @property {boolean} res - True iff the list of projects was retrieved successfully.
     * @property {APIError} [err] - The error that caused the request to fail.
     * @property {string[]|Project[]} projects - The set of project names, or project objects, if specified.
     */

    /**
     * API endpoint to retrieve a list of projects (a.k.a. 'species') defined in the system.
     * @hbcsapi {GET} projects - This is an API endpoint.
     * @param {boolean} [all=false] - If true, all projects will be retrieved, regardless of their inactivity.
     * @param {boolean} [details=false] - If true, a list of Project objects will be returned, else a simple list of project names as strings.
     * @returns {ProjectListAPIResponse} The API response providing the list of all projects.
     */
    app.get('/projects', function(req, res) {
        var all = req.query.all;
        var details = req.query.details;

        // Restrict all project listing to researcher and above.
        if (!req.user || !(req.user.isResearcher() || req.user.isAdmin())) {
            all = false;
        }

        db.getProjects(all, null, details, function(err, list) {
            if (err) {
                return res.send(new errors.APIErrResp(2, 'Failed to fetch project list.'));
            } else {
                return res.send({
                    'res': true,
                    'projects': list
                });
            }
        });
    });

    /**
     * API endpoint to delete a field defined for a given project. Deleting a field will *destroy* all data
     * currently associated with that field. May only be applied to inactive projects.
     * @hbcsapi {DELETE} project/:pid/fields/:fid - This is an API endpoint.
     * @param {number} pid - The project id to modify.
     * @param {number} fid - The id of the field to delete.
     * @returns {BasicAPIResponse} The API response detailing if the delete was successful.
     */
    app.del('/projects/:pid/fields/:fid', auth.enforceLoginCustom({'minPL':users.PrivilegeLevel.RESEARCHER.i}), function(req, res) {
        var pid = parseInt(req.params.pid);
        var fid = parseInt(req.params.fid);

        if (_.isNaN(pid)) {
            return res.send(new errors.APIErrResp(2, 'Invalid project id.'));
        } else if (_.isNaN(fid)) {
            return res.send(new errors.APIErrResp(3, 'Invalid field id.'));
        }

        // Check the user's access to the project.
        return db.checkProjectAccess(req.user, pid, function(aErr, access) {
            if (aErr) {
                console.log(aErr);
                return res.send(new errors.APIErrResp(4, 'Failed to delete field.'));
            } else {
                console.log(access);
                if (access) {
                    // User may modify the project.
                    return db.deleteFields(pid, fid, function(err, found) {
                        if (err) {
                            console.log(err);
                            return res.send(new errors.APIErrResp(4, 'Failed to delete field.'));
                        } else if (found) {
                            return res.send({
                                'res': true
                            });
                        } else {
                            return res.send(new errors.APIErrResp(5, 'Project or field not found.'));
                        }
                    });
                } else {
                    return res.send(new errors.APIErrResp(5, 'Project or field not found.'));
                }
            }
        });
    });

    /**
     * @typedef ProjectFieldsAPIResponse
     * @type {object}
     * @property {boolean} res - True iff the list of projects was retrieved successfully.
     * @property {APIError} [err] - The error that caused the request to fail.
     * @property {ProjectField[]} fields - The set of non-annotation project specific fields.
     * @property {ProjectField[]} anno - The set of annotation project specific fields.
     */

    /**
     * API endpoint to retrieve all project-specific fields defined for a given project. Generic fields and
     * annotations will be separated for easier import into frontends.
     * @hbcsapi {GET} project/fields - This is an API endpoint.
     * @param {number} project - The id of the project to lookup.
     * @returns {ProjectFieldsAPIResponse} The API response providing the list of all project specific fields.
     */
    app.get('/project/fields', auth.enforceLoginCustom({'minPL':1}), function(req, res) {
        var id = parseInt(req.query.project);
        if (_.isNaN(id) || id < 0)  {
            return res.send(new errors.APIErrResp(2, 'Invalid project id.'));
        }

        var all = true;
        // Restrict field listing for inactive project to researcher and above.
        if (!req.user || !(req.user.isResearcher() || req.user.isAdmin())) {
            console.log('woah');
            console.log(req.user.isResearcher());
            all = false;
        }

        return db.getProjects(all, id, false, function(e, list) {
            if (e) {
                console.log(e);
                return res.send(new errors.APIErrResp(3, 'Failed to retrieve fields.'));
            } else {
                // We should have gotten a single result, if we are allowed access.
                if (list.length === 1) {
                    db.getFields(id, function(err, fieldList) {
                        if (err || !_.isArray(fieldList)) {
                            console.log(err);
                            return res.send(new errors.APIErrResp(3, 'Failed to retrieve fields.'));
                        } else {
                            // Split fields into two categories for easier use by the annotator
                            var meta = [];
                            var anno = fieldList.filter(function(ele) {
                                // Set required to true/false in all
                                ele.required = (ele.required !== 0);

                                if (ANNO_TYPES.indexOf(ele.type) < 0) {
                                    meta.push(ele);
                                    return false;
                                } else {
                                    // We need to rename type and it's value for the image-annotator
                                    ele.shape = typeToShape(ele.type);
                                    delete ele.type;
                                    return true;
                                }
                            });

                            return res.send({
                                'res': true,
                                'fields': meta,
                                'anno': anno
                            });
                        }
                    });
                } else {
                    // This project wasn't found, it either doesn't exist or we aren't authorised.
                    return res.send(new errors.APIErrResp(4, 'That project does not exist!'));
                }
            }
        });
    });

    /**
     * API endpoint to define new project specific fields on a specified project.
     * @hbcsapi {POST} project/fields - This is an API endpoint.
     * @param {number} id - The id of the project to add fields to.
     * @param {ProjectField[]} fields - The non-annotation project specific fields to add.
     * @param {ProjectField[]} anno - The annotation fields to add.
     * @returns {BasicAPIResponse} The API response detailing whether the request was successful or not.
     */
    app.post('/project/fields', auth.enforceLogin, function(req, res) {
        var id = parseInt(req.body.id);
        if (_.isNaN(id)) {
            return res.send(new errors.APIErrResp(2, 'Invalid project id.'));
        }
        var fieldList = req.body.fields;
        var annoList = req.body.anno;
        if (!_.isArray(fieldList) || !_.isArray(annoList) || (fieldList.length < 1 && annoList.length < 1)) {
            return res.send(new errors.APIErrResp(3, 'Invalid field or annotation list.'));
        } else {
            var parseError = parseFields(fieldList, annoList);
            if (parseError.i !== -1) {
                return res.send(new errors.APIErrResp(3, 'Invalid field in section ' + parseError.part + ' position: ' + parseError.i));
            }
        }

        db.setFields(id, fieldList.concat(annoList), function(err) {
            if (err) {
                console.log(err);
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.send(new errors.APIErrResp(4, 'Duplicate field names found for this project.'));
                } else {
                    return res.send(new errors.APIErrResp(5, 'Failed to update project.'));
                }
            } else {
                return res.send({'res': true});
            }
        });
    });

    /**
     * @typedef ProjectAPIResponse
     * @type {object}
     * @property {boolean} res - True iff the request was successful.
     * @property {APIError} [err] - The error the caused the request to fail.
     * @property {Project} [proj] - The project affected by the request.
     */

    /**
     * API endpoint to create a new project.
     * @hbcsapi {POST} project/new - This is an API endpoint.
     * @param {string} name - The display name of the project to create.
     * @param {string} desc - A short description of the project.
     * @returns {ProjectAPIResponse} The API response detailing the resultant project, with it's id property set.
     */
    app.post('/project/new', auth.enforceLogin, function(req, res) {
        var proj = new Project(-1, req.body.name, req.body.desc, false);
        if (proj.id === false) {
            return res.send(new errors.APIErrResp(2, 'Invalid project data.'));
        }

        return db.createProject(proj, function(err, p) {
            proj = p; // Ensure these both refer to the same object.
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    console.log('Tried to create duplicate project.');
                    return res.send(new errors.APIErrResp(3, 'A project with this name already exists.'));
                } else {
                    console.log(err);
                    return res.send(new errors.APIErrResp(4, 'Failed to create project.'));
                }
            } else {
                return res.send({
                    'res': true,
                    'project': p
                });
            }
        });
    });

    /**
     * API endpoint to retrieve details on a project. Projects may be retrieved by id or by name.
     * @hbcsapi {GET} project/info - This is an API endpoint.
     * @param {number} [id] - The id of the project to lookup.
     * @param {string} [name] - The name of the project to lookup. Ignored if id is provided and is valid.
     * @returns {ProjectAPIResponse} The API response that provides the project information, if found.
     */
    app.get('/project/info', function(req, res) {
        var id = parseInt(req.query.id);
        var pname = req.query.name;

        if (_.isNaN(id)) {
            if (typeof pname === 'undefined') { 
                return res.send(new errors.APIErrResp(2, 'Invalid id.'));
            } else if (typeof pname === 'string' && pname.length > 0) {
                id = pname;
            } else {
                return res.send(new errors.APIErrResp(2, 'Invalid name.'));
            }
        }
        db.getProject(id, function(err, pR) {
            if (err) {
                console.log(err);
                return res.send(new errors.APIErrResp(3, 'Failed to retrieve project.'));
            } else {
                if (pR === null) {
                    return res.send(new errors.APIErrResp(4, 'Project id does not exist.'));
                }
                var proj = new Project(pR[0].projectid, pR[0].name, pR[0].desc, pR[0].active);
                if (proj.id === false) {
                    console.log('Failed to make project from db result.');
                    return res.send(new errors.APIErrResp(3, 'Failed to retrieve project.'));
                }
                return res.send({
                    'res': true,
                    'project': proj
                });
            }
        });
    });
}

// Export all public members.
module.exports = {
    Project:Project,
    projectRoutes:projectRoutes
};

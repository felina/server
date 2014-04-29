/**
 * @module projects
 */

var _ = require('underscore');
var errors = require('./error.js');
var auth = require('./auth/auth.js');
var db = require('./db.js');
var Project = require('./models/Project.js');
var Field = require('./models/Field.js');

/**
 * @typedef FieldParseError
 * @type {object}
 * @property {string} [part=''] - The section the first error was found in, if present.
 * @property {number} [i=-1] - The index of the erroneous field within the supplied part, if present.
 */

/**
 * Parses and validates field definitions.
 * @param {number} pid - The id of the project the fields are declared on.
 * @param {object[]} fieldList - The list of field definitions for a project.
 * @param {object[]} annoList - The list of annotation definitions for a project.
 * @returns {FieldParseError} The details of the first error found in the definitions, if any exist.
 */
function parseFields(pid, fieldList, annoList) {
    var errIdx = -1;
    var errList = '';

    // Check every field definition, breaking out of the loop if an error is found.
    // fieldList.every(function(f, i) {
    //     if (_.isObject(f)) {
    //         // Use the Field constructor to check parameters.
    //         var field = new Field(-1, pid, f.name, f.type, f.required);

    //         if (field.id === false) {
    //             console.log('Bad field definition.');
    //             errIdx = i;
    //             errList = 'fields';
    //             return false;
    //         } else {
    //             return true;
    //         }
    //     } else {
    //         errIdx = i;
    //         errList = 'fields';
    //         return false;
    //     }
    // });

    // Skip checking annotations if fields are invalid.
    console.log(pid, fieldList, annoList);
    if (errIdx === -1) {
        annoList.every(function(f, i) {
            if (_.isObject(f)) {
                // Use the Field constructor to check parameters.
                var field = new Field(-1, pid, f.name, f.type, f.required);

                if (field.id === false) {
                    console.log('Bad anno definition.');
                    errIdx = i;
                    errList = 'anno';
                    return false;
                } else {
                    return true;
                }
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

/***
 ** API ROUTE FUNCTIONS
 **/

/**
 * @typedef ProjectListAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the list of projects was retrieved successfully.
 * @property {APIError} [err] - The error that caused the request to fail.
 * @property {string[]|Project[]} projects - The set of project names, or project objects, if specified.
 */

/**
 * API endpoint to retrieve a list of projects (a.k.a. 'species') defined in the system.
 * @hbcsapi {GET} /projects - This is an API endpoint.
 * @param {boolean} [all=false] - If true, all projects will be retrieved, regardless of their inactivity.
 * @param {boolean} [details=false] - If true, a list of Project objects will be returned, else a simple list of project names as strings.
 * @returns {ProjectListAPIResponse} The API response providing the list of all projects.
 */
function getProjects(req, res) {
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
}

/**
 * API endpoint to delete a field defined for a given project. Deleting a field will *destroy* all data
 * currently associated with that field. May only be applied to inactive projects.
 * @hbcsapi {DELETE} /projects/:pid/fields/:fid - This is an API endpoint.
 * @param {number} :pid - The project id to modify.
 * @param {number} :fid - The id of the field to delete.
 * @returns {BasicAPIResponse} The API response detailing if the delete was successful.
 */
function delProjectsIdFieldsId(req, res) {
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
}

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
 * @hbcsapi {GET} /projects/:pid/fields - This is an API endpoint.
 * @param {number} :pid - The id of the project to lookup.
 * @returns {ProjectFieldsAPIResponse} The API response providing the list of all project specific fields.
 */
function getProjectsIdFields(req, res) {
    var id = parseInt(req.params.pid);
    if (_.isNaN(id) || id < 0)  {
        return res.send(new errors.APIErrResp(2, 'Invalid project id.'));
    }

    var all = true;
    // Restrict field listing for inactive project to researcher and above.
    if (!req.user || !(req.user.isResearcher() || req.user.isAdmin())) {
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

                            if (Field.prototype.ANNO_TYPES.indexOf(ele.type) < 0) {
                                meta.push(ele);
                                return false;
                            } else {
                                // We need to rename type and it's value for the image-annotator
                                ele.shape = ele.type.substring(1); // TODO: Placeholder
                                //ele.shape = typeToShape(ele.type);
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
}

/**
 * API endpoint to define new project specific fields on a specified project.
 * @hbcsapi {POST} /projects/:pid/fields - This is an API endpoint.
 * @param {number} :pid - The id of the project to add fields to.
 * @param {ProjectField[]} fields - The non-annotation project specific fields to add.
 * @param {ProjectField[]} anno - The annotation fields to add.
 * @returns {BasicAPIResponse} The API response detailing whether the request was successful or not.
 */
function postProjectsIdFields(req, res) {
    var id = parseInt(req.params.pid);
    if (_.isNaN(id)) {
        return res.send(new errors.APIErrResp(2, 'Invalid project id.'));
    }
    var fieldList = req.body.fields;
    var annoList = req.body.anno;
    if (false) {//!_.isArray(fieldList) || !_.isArray(annoList) || (fieldList.length < 1 && annoList.length < 1)) {
        return res.send(new errors.APIErrResp(3, 'Invalid field or annotation list.'));
    } else {
        var parseError = parseFields(id, fieldList, annoList);
        if (parseError.i !== -1) {
            return res.send(new errors.APIErrResp(3, 'Invalid field in section ' + parseError.part + ' position: ' + parseError.i));
        }
    }

    return db.checkProjectAccess(req.user, id, function(aErr, access) {
        if (aErr) {
            console.log(aErr);
            return res.send(new errors.APIErrResp(4, 'Failed to delete field.'));
        } else {
            console.log(access);
            if (access) {
                // User may modify the project.
                var stuffToInsert = [];
                if (fieldList) {
                    stuffToInsert = fieldList;
                }
                stuffToInsert = fieldList.concat(annoList);
                return db.setFields(id, stuffToInsert, function(err) {
                    if (err) {
                        console.log(err);
                        if (err.code === 'ER_DUP_ENTRY') {
                            return res.send(new errors.APIErrResp(4, 'Duplicate field names found for this project.'));
                        } else {
                            return res.send(new errors.APIErrResp(5, 'Failed to update project.'));
                        }
                    } else {
                        return res.send({
                            'res': true
                        });
                    }
                });
            } else {
                return res.send(new errors.APIErrResp(6, 'You are not authorized to modify this resource.'));
            }
        }
    });
}

/**
 * @typedef ProjectAPIResponse
 * @type {object}
 * @property {boolean} res - True iff the request was successful.
 * @property {APIError} [err] - The error the caused the request to fail.
 * @property {Project} [proj] - The project affected by the request.
 */

/**
 * API endpoint to create a new project.
 * @hbcsapi {POST} projects - This is an API endpoint.
 * @param {string} name - The display name of the project to create.
 * @param {string} desc - A short description of the project.
 * @returns {ProjectAPIResponse} The API response detailing the resultant project, with it's id property set.
 */
function postProjects(req, res) {
    console.log(req.body);
    var proj = new Project(-1, req.body.name, req.body.desc, true);
    console.log(proj);
    if (proj.id === false) {
        return res.send(new errors.APIErrResp(2, 'Invalid project data.'));
    }

    return db.createProject(req.user, proj, function(err, p) {
        if (err) {
            if (p) {
                // If the project has been sent too, then creation passed but access failed.
                console.log('Orphaned project!');
                return res.send(new errors.APIErrResp(5, 'Project creation succeeded, but failed to give ownership.'));
            } else if (err.code === 'ER_DUP_ENTRY') {
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
}

/**
 * API endpoint to retrieve details on a project. Projects may be retrieved by id or by name.
 * @hbcsapi {GET} /projects/:pid - This is an API endpoint.
 * @param {number|string} :pid - The id or name of the project to lookup. In the case of a numeric name, an id must be used.
 * @returns {ProjectAPIResponse} The API response that provides the project information, if found.
 */
function getProjectsId(req, res) {
    var id = parseInt(req.params.pid);

    if (_.isNaN(id)) {
        if (typeof req.params.pid === 'string' && req.params.pid.length > 0) {
            id = req.params.pid;
        } else {
            return res.send(new errors.APIErrResp(2, 'Invalid project id.'));
        }
    }

    return db.getProject(id, function(err, proj) {
        if (err) {
            console.log(err);
            return res.send(new errors.APIErrResp(3, 'Failed to retrieve project.'));
        } else {
            if (!proj) {
                return res.send(new errors.APIErrResp(4, 'Project id does not exist.'));
            } else if (proj.projectid === false) {
                console.log('Failed to make project from db result.');
                return res.send(new errors.APIErrResp(3, 'Failed to retrieve project.'));
            } else {
                return res.send({
                    'res': true,
                    'project': proj
                });
            }
        }
    });
}

/**
 * API endpoint to update details on a project.
 * @hbcsapi {PUT} /projects/:pid - This is an API endpoint.
 * @param {number} :pid - The id of the project to update.
 * @returns {ProjectAPIResponse} The API response that provides the updated project information.
 */
function putProjectsId(req, res) {
    var id = parseInt(req.params.pid);
    var name = req.body.name;
    var desc = req.body.desc;
    var active = req.body.active;

    if (_.isNaN(id)) {
        return res.send(new errors.APIErrResp(2, 'Invalid project id.'));
    }

    if (name) {
        if (!(_.isString(name) && name.length > 0 && name.length <= Project.prototype.NAME_LENGTH)) {
            return res.send(new errors.APIErrResp(3, 'Invalid project name.'));
        }
    } else {
        // Ensure we don't set.
        name = null;
    }

    if (desc) {
        if (!(_.isString(desc) && desc.length > 0 && desc.length <= Project.prototype.DESC_LENGTH)) {
            return res.send(new errors.APIErrResp(3, 'Invalid project description.'));
        }
    } else {
        // Ensure we don't set.
        desc = null;
    }

    if (active) {
        if (!_.isBoolean(active)) {
            return res.send(new errors.APIErrResp(3, 'Invalid project activation state.'));
        }
    } else if (active !== false) {
        // Ensure we don't set. Have to do an additional check for literal false.
        active = null;
    }

    return db.checkProjectAccess(req.user, id, function(aErr, access) {
        if (aErr) {
            console.log(aErr);
            return res.send(new errors.APIErrResp(4, 'Failed to update project.'));
        } else {
            if (access) {
                // User may modify the project.
                return db.updateProject(id, name, desc, active, function(err, modified) {
                    if (err) {
                        console.log(err);
                        return res.send(new errors.APIErrResp(4, 'Failed to update project.'));
                    } else {
                        if (!modified) {
                            return res.send(new errors.APIErrResp(5, 'No changes made.'));
                        } else {
                            // Redirect the user with a 303 See Other
                            return res.redirect(303, '/projects/' + id);
                        }
                    }
                });
            } else {
                return res.send(new errors.APIErrResp(6, 'You are not authorized to modify this resource.'));
            }
        }
    });
}

/** Registers Express routes related to project handling. These are API endpoints.
 * @static
 * @param {Express} app - The Express application object.
 */
function projectRoutes(app) {
    app.get('/projects', getProjects);
    app.post('/projects', auth.enforceLoginCustom({'minPL':'researcher'}), postProjects);
    app.get('/projects/:pid', getProjectsId);
    app.put('/projects/:pid', auth.enforceLoginCustom({'minPL':'researcher'}), putProjectsId);
    app.get('/projects/:pid/fields', auth.enforceLogin, getProjectsIdFields);
    app.post('/projects/:pid/fields', auth.enforceLoginCustom({'minPL':'researcher'}), postProjectsIdFields);
    app.del('/projects/:pid/fields/:fid', auth.enforceLoginCustom({'minPL':'researcher'}), delProjectsIdFieldsId);
}

// Export all public members.
module.exports = {
    projectRoutes:projectRoutes
};

var _ = require('underscore');
var errors = require('./error.js');

var NAME_LENGTH = 45;
var DESC_LENGTH = 255;

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

var FIELD_NAME_LENGTH = 45;
var FIELD_TYPES = ['enum', 'string', 'number'];
var ANNO_TYPES = ['apoly', 'arect', 'apoint'];

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

function parseFields(fieldList, annoList) {
    var errIdx = -1;
    var errList = '';

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

function projectRoutes(app, auth, db) {

    // Gets a list of active projects (i.e. species)
    app.get('/projects', function(req, res) {
        var all = req.query.all;

        db.getProjects(all, function(err, list) {
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

    app.get('/project/fields', function(req, res) {
        var id = parseInt(req.query.project);
        if (_.isNaN(id) || id < 0)  {
            return res.send(new errors.APIErrResp(2, 'Invalid project id.'));
        }

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
    });

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
                return res.send(new errors.APIErrResp(4, 'Failed to update project.'));
            } else {
                return res.send({'res': true});
            }
        });
    });

    app.post('/project/new', auth.enforceLogin, function(req, res) {
        var proj = new Project(-1, req.body.name, req.body.desc, false);
        if (proj.id === false) {
            return res.send({'res': false, 'err': new errors.APIError(2, 'Invalid project data.')});
        }

        db.createProject(proj, function(err, id) {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    console.log('Tried to create duplicate project.');
                    return res.send({'res': false, 'err': new errors.APIError(3, 'A project with this name already exists.')});
                } else {
                    console.log(err);
                    return res.send({'res': false, 'err': new errors.APIError(4, 'Failed to create project.')});
                }
            } else {
                console.log('New project: ' + id);
                proj.id = id;
                return res.send({'res': true, 'project': proj});
            }
        });
    });

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

module.exports = {Project:Project, projectRoutes:projectRoutes};

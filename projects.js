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

function projectRoutes(app, auth, db) {

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

    app.get('/project/info', auth.enforceLogin, function(req, res) {
	var id = parseInt(req.query.id);

	if (_.isNaN(id)) {
	    return res.send({'res': false, 'err': new errors.APIError(2, 'Invalid id.')});
	}
	db.getProject(id, function(err, pR) {
	    if (err) {
		console.log(err);
		return res.send({'res': false, 'err': new errors.APIError(3, 'Failed to retrieve project.')});
	    } else {
		if (pR === null) {
		    return res.send({'res': false, 'err': new errors.APIError(4, 'Project id does not exist.')});
		}
		var proj = new Project(id, pR[0].name, pR[0].desc, pR[0].active);
		if (proj.id === false) {
		    console.log('Failed to make project from db result.');
		    return res.send({'res': false, 'err': new errors.APIError(3, 'Failed to retrieve project.')});
		}
		return res.send({'res': true, 'project': proj});
	    }
	});
    });

}

module.exports = {Project:Project, projectRoutes:projectRoutes};

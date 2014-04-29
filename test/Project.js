var should = require('should');
var Project = require('../src/models/Project.js');

describe('Project', function() {
    it ('should set id to false when parameters are invalid', function() {
        (new Project(99, 'Penguins', 'A study on penguins.', true)).should.have.property('id', 99);
        (new Project(null, 'Penguins', 'A study on penguins.', true)).should.have.property('id', false);
        (new Project(99, 99, 'A study on penguins.', true)).should.have.property('id', false);
        (new Project(99, 'Penguins', Array(Project.prototype.DESC_LENGTH + 2).join("z"), true)).should.have.property('id', false);
    });
});

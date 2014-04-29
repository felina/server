var should = require('should');
var Field = require('../src/models/Field.js');

describe('Field', function() {
    it ('should set id to false when parameters are invalid', function() {
        (new Field(39, 12, 'Head', 'apoly', true)).should.have.property('id', 39);
        (new Field('invalid', 12, 'Head', 'apoly', true)).should.have.property('id', false);
        (new Field(39, {}, 'Head', 'apoly', true)).should.have.property('id', false);
        (new Field(39, 12, Array(Field.prototype.NAME_LENGTH + 2).join("a"), 'apoly', true)).should.have.property('id', false);
    });
});






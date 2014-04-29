var should = require('should');
var Field = require('../src/models/Field.js');

describe('Field', function() {
    it ('should set id to false when parameters are invalid', function() {
        (new Field(39, 12, 'Head', 'apoly', true)).should.have.property('id', 39);
        (new Field('invalid', 12, 'Head', 'apoly', true)).should.have.property('id', false);
        (new Field(39, {}, 'Head', 'apoly', true)).should.have.property('id', false);
        (new Field(39, 12, Array(Field.prototype.NAME_LENGTH + 2).join("a"), 'apoly', true)).should.have.property('id', false);
    });

    describe('#typeToShape()', function() {
        it ('should return a string detailing the shape', function() {
            (new Field(39, 12, 'Head', 'apoly', true)).typeToShape().should.be.exactly('poly');
            (new Field(39, 12, 'Head', 'apoint', true)).typeToShape().should.be.exactly('point');
            (new Field(39, 12, 'Head', 'arect', true)).typeToShape().should.be.exactly('rect');
            (new Field(39, 12, 'Head', 'number', true)).typeToShape().should.be.exactly('poly');
        });
    });

    describe('#shapeToType()', function() {
        it ('should return a type string matching the shape parameter', function() {
            (new Field(39, 12, 'Head', 'number', true)).shapeToType('rect').should.be.exactly('arect');
            (new Field(39, 12, 'Head', 'number', true)).shapeToType('poly').should.be.exactly('apoly');
            (new Field(39, 12, 'Head', 'number', true)).shapeToType('point').should.be.exactly('apoint');
            should.not.exist((new Field(39, 12, 'Head', 'number', true)).shapeToType('invalid'));
        });
    });
});

var should = require('should');
var User = require('../src/models/User.js');

describe('User', function() {
    it ('should set id to false when parameters are invalid', function() {
        (new User(12, 'Bob Ross', 'mail@example.com', 1, '01ba86c032f9586c71c40b86879beef4')).should.have.property('id', 12);
        (new User('invalid', 'Bob', 'mail@example.com', 1)).should.have.property('id', false);
        (new User(12, {}, 'mail@example.com', 1)).should.have.property('id', false);
        (new User(12, 'Bob', 'mail.com', 1)).should.have.property('id', false);
        (new User(12, 'Bob', 'mail@example.com', -1)).should.have.property('id', false);
    });

    describe('#profileURL()', function() {
        it ('should return a URL to the appropriate profile image', function() {
            (new User(-1, 'Jamie', 'test@example.com', 1, '01ba86c032f9586c71c40b86879beef4')).profileURL().should.be.exactly('http://www.gravatar.com/avatar/01ba86c032f9586c71c40b86879beef4');
            (new User(-1, 'Jamie', 'test@example.com', 1)).profileURL().should.endWith('user.png');
        });
    });

    describe('#isType()', function() {
        it ('should return true when we match the type we created the user with', function() {
            var sub = new User(-1, 'Subuser', 'sub@example.com', 0, null, 999, 1);
            var usr = new User(-1, 'User', 'usr@example.com', 1);
            var rsr = new User(-1, 'Researcher', 'rsr@example.com', 2);
            var adm = new User(-1, 'Admin', 'adm@example.com', 3);
            sub.isType('subuser').should.be.true;
            sub.isType('user').should.be.false;
            usr.isType('subuser').should.be.false;
            usr.isType('subuser', true).should.be.true;
            usr.isType('admin').should.be.false;
            rsr.isType('user', true).should.be.true;
            rsr.isType('researcher', true).should.be.true;
            rsr.isType('admin', true).should.be.false;
            adm.isType('user').should.be.false;
        });
    });
});






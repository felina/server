var bcrypt = require('bcrypt-nodejs');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var userstable = [
    {id: 1, username: 'bob', password: 'secret', email: 'bob@example.com' },
    {id: 2, username: 'fred', password: 'birthday', email: 'fred@example.com'}
];

function findById(id, fn) {
    var idx = id - 1;
    if (users[idx]) {
        fn(null, users[idx]);
    } else {
        fn(new Error('User ' + id + ' does not exist'));
    }
}

function findByUsername(username, fn) {
    for (var i = 0, len = userstable.length; i < len; i++) {
        var user = userstable[i];
        if (user.username == username) {
            return fn(user.password);
        }
    }
    return fn(null);
}


passport.use(new LocalStrategy(
    function(username, password, done) {
        // var passHash = bcrypt.hash(password, email, null, function(err, hash))
        var passHash = findByUsername(username, bcrypt.hashSync());
        // bcrypt.compare(password, passHash, function(err, res));
        bcrypt.compareSync(password, passHash);
    })
);

function testPass(username, password) {
    var passHash = findByUsername(username, bcrypt.hashSync);
    return bcrypt.compareSync(password, passHash);
}

console.log(testPass("bob", "secret"));
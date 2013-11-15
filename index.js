var Strategy, app, express, fs, passport, mysql, conn, path, port, stuffDict;

express = require('express');
passport = require('passport');
LocalStrategy = require('passport-local').Strategy;
path = require('path');
fs = require('fs');
mysql = require('mysql');

// Init express application
app = express();

app.configure(function () {
    app.use(express.static('public'));
    app.use(express.logger());
    //app.use(express.bodyParser());
    //app.use(passport.initialize());
    app.use(app.router);
});

stuffDict = {};

// Init DB conn
conn = mysql.createConnection({
    host:       'localhost',
    user:       'serv',
    password:   'pass'
});

conn.connect(function (err) {
    // Connected, unless 'err' is set
    if (err) {
        console.log('Unable to connect to MySQL DB');
    }
    else {
        console.log('Connected to MySQL DB!');
    }
});

// User login config
passport.use(new LocalStrategy(
    function (username, password, done) {
        // TODO: Auth method
        console.log('Hi');
        return done(null, 'ali');
        console.log('User: ' + username,
                    'Pass: ' + password);

        if (username == 'ali' && password == 'pass') {
            return done(null, 'ali');
        }
        else {
            return done(null, false, { message: 'Bad login.' });
        }
    }
));

// TEMP Hello world
app.get('/', function(req, res) {
    return res.send('Hello World!\n');
});

// ...?
app.get('/:key/:value', function(req, res) {
    var k, v;
    stuffDict[req.params.key] = req.params.value;
    return res.send(((function() {
        var _results;
        _results = [];
        for (k in stuffDict) {
            v = stuffDict[k];
            _results.push(k + " -> " + v + "\n");
        }
        return _results;
    })()).join(""));
});

// Login callback - user auth
app.post('/login', function (req, res) {
    // Get username / password 
    // Basic Auth
    var header = req.headers['authorization'] || '',
        token = header.split(/\s+/).pop() || '',
        auth = new Buffer(token, 'base64').toString(),
        parts = auth.split(/:/),
        username = parts[0],
        password = parts[1];

    // DB asynchronous select user
    var sql = "SELECT * FROM test.users WHERE username=" + conn.escape(username);
    conn.query(sql, function (err, rows, fields) {
        console.log('\nUsername: ' + username);
        console.log('Password: ' + password + '\n');

        // Error catching
        if (err) {
            console.log(err);
            res.send({ 'err': err });
        }
        // Check password
        else {
            if (rows[0]) {
                if (password == rows[0].password) {
                    console.log('Password valid');
                    res.send({ 'err': null, 'name': username, 'id': rows[0].idusers, 'online': true });
                }
                else {
                    res.status(401).send({ 'err': 'Invalid Password' });
                }
            }
            else {
                res.status(401).send({ 'err' : 'User not found' });
            }
        }
    });
});


// Root callback - show req
app.post('/', function (req, res) {
    return console.log(req);
});

// File request callback
app.post('/start', function(req, res) {
    if (req.files) {
        console.log('File exists');
        // console.log(req.files);
        console.log('Num files: ' + Object.keys(req.files).length)

    } else {
        console.log('File does not exist');
    }
    return res.send("Some image thing recieved\n");
});

// Start listening
port = process.env.PORT || 5000;

app.listen(port, function() {
    return console.log("Listening on " + port);
});


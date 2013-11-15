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
    host: 'localhost',
    user: 'serv',
    password: 'pass'
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

// TEMP Hello response
app.get('/hello', function (req, res) {
    var name = req.param('name');
    if (name) {
        console.log('Received name: ' + name + '\n');
        return res.send({ 'name': name });
    }
    else {
        return res.send('Nothing received');
    }
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
app.post('/login',
    function (req, res) {
        // Check username / password (POST)
        var username = req.get('username');
        var password = req.get('password');

        console.log('\nUsername: ' + username);
        console.log('Password: ' + password + '\n');

        if (username == 'admin') {
            console.log(username + ' attempting login...');
            if (password == 'pass') {
                console.log('Password valid');
                return res.redirect('/hello?name=' + username);
            }
            else {
                return res.status(401);
            }
        }
        else {
            return res.send('Sorry, username not recognized!');
        }
    }
);

// Root callback - show req
app.post('/', function (req, res) {
    return console.log(req);
});

// File request callback
app.post('/file', function(req, res) {
    console.log('here1');
    if (req.files) {
        console.log('File exists');
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


var Strategy, app, express, fs, passport, path, port, stuffDict;

express = require('express');
passport = require('passport');
Strategy = require('passport-local').Strategy;
path = require('path');
fs = require('fs');

// Init express application
app = express();
app.use(express.logger());
app.use(express.bodyParser());

stuffDict = {};

// User login config
passport.use(new Strategy(
    function (username, password, done) {
        // TODO: Auth method
        return console.log(username, password, done);
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
app.post('/login',
    passport.authenticate('local',
    function (req, res) {
        // Called on success
        // e.g: res.redirect('/users/' + req.user.username);
    }
));

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

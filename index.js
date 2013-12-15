var express = require('express');
var passport = require('passport');
var Strategy = require('passport-local').Strategy;
var path = require('path');
var fs = require('fs');
var auth = require('./localauth.js');
var users = require('./user.js');

// TODO: Actually be useful
passport.serializeUser(function(user, done) {
	done(null, user);
});

passport.deserializeUser(function(id, done) {
	done(null, user);
});

// User login config
passport.use(auth.LocalStrategy);

// Init express application
app = express();
app.use(express.logger());
app.use(express.bodyParser());
app.use(passport.initialize());
app.use(passport.session());

stuffDict = {};

// TEMP Hello world
app.get('/', function(req, res) {
    return res.send('Hello World!\n');
});

// ...?
app.get('/:key/:value', function(req, res) {
    var k, v;
    stuffDict[req.params.key] = req.params.value;
    return res.send(((function() {
        var _results = [];
        for (k in stuffDict) {
            v = stuffDict[k];
            _results.push(k + " -> " + v + "\n");
        }
        return _results;
    })()).join(""));
});

app.post('/register', function(req, res) {
    var mail = req.body.user.mail;
    var name = req.body.user.name;
	var pass = req.body.user.pass;
    var priv = users.PrivilegeLevel.USER.i;
    var user = new users.User(-1, name, mail, priv);
	auth.register(user, pass);
	return res.send(["Registered user:",mail,pass,name,priv].join(" "));
});

// Login callback - user auth
app.post('/login',
    passport.authenticate('local', { failureRedirect: '/' }),
    function (req, res) {
        // Called on success
        // e.g: res.redirect('/users/' + req.user.username);
		res.send('You logged in.\n');
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


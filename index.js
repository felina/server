(function() {
  var Strategy, app, express, fs, passport, path, port, stuffDict;

  express = require('express');
  passport = require('passport');
  Strategy = require('passport-local').Strategy;
  path = require('path');
  fs = require('fs');

  app = express();
  app.use(express.logger());
  app.use(express.bodyParser());

  stuffDict = {};

  passport.use(new Strategy(function(username, password, done) {
    return console.log(username, password, done);
  }));

  app.get('/', function(req, res) {
    return res.send('Hello World!\n');
  });

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

  app.post('/login', passport.authenticate('local'));

  app.post('/', function(req, res) {
    return console.log(req);
  });

  app.post('/file', function(req, res) {
    console.log('here1');
    if (req.files) {
      console.log('File exists');
    } else {
      console.log('File does not exist');
    }
    return res.send("Some image thing recieved\n");
  });

  port = process.env.PORT || 5000;

  app.listen(port, function() {
    return console.log("Listening on " + port);
  });

}).call(this);

var express = require('express');
var passport = require('passport');
var path = require('path');
var fs = require('fs');
var auth = require('./localauth.js');
var users = require('./user.js');
var mysql = require('mysql');
var _ = require('underscore');
var md5 = require('MD5');
var aws = require('aws-sdk');
// var png = require('png-js');

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

app.configure(function () {
    app.use(express.static('public'));
    //app.use(express.logger());
    app.use(express.bodyParser());
    aws.config.loadFromPath('./config.json');
    // console.log(aws.config);
    //app.use(express.session({ secret: 'I should be something else' }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(app.router);
});

var s3 = new aws.S3();

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
		res.send('Logged in.\n');
    }
);

/*
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
*/

// Root callback - show req
app.post('/', function (req, res) {
    console.log(req);
    return res.send('Ack');
});

function fileType(filePath) {
    filetype = ""
    for (var i = filePath.length; i > 0; i--) {
        if (filePath[i] === '.') {
            return filePath.slice(i + 1, filePath.length);
        }
    }
    return null;
}

// Image/s upload endpoint
app.post('/upload/img', function (req, res) {
    var resultObject = {};
    resultObject.status = {};

    var idData = req.files;
    var images = [];
    for (var imageName in idData) {
        images.push(idData[imageName]);
    }
    if (images.length > 0) {
        resultObject.status.code = 0;
        resultObject.status.code = 0;
        resultObject.status.message = images.length.toString().concat(" images uploaded successfully");
        resultObject.ids = [];
        for (var i = 0; i < images.length; i++) {
            var imageFilePath = images[i].path;
            var fileContents = fs.readFileSync(imageFilePath); // semi sketchy decoding
            var elementsToHash = "";
            for (var j = 0; j < fileContents.length; j += fileContents.length / 100) {
                elementsToHash += fileContents[Math.floor(j)];
            }
            // console.log(elementsToHash);
            var imageHash = md5(elementsToHash);
            resultObject.ids.push(imageHash);
            // if element hash not in database then upload to s3
            var imageObject = {"imageData" : fileContents, "imageType" : fileType(imageFilePath), "imageHash" : imageHash};
            uploadImage(imageObject);
        }
    } else {
        resultObject.status.code = 1;
        resultObject.status.message = "No images uploaded";
    }
    return res.send(resultObject);
});

// app.get('img/:name')

function uploadImage(imageObject) {
    params = {};
    params.Bucket = 'citizen.science.image.storage';
    params.Body = imageObject.imageData;
    params.Key = imageObject.imageHash;
    s3.putObject(params, function (err, data) {
        if (err) {
            console.log("error: " + err);
        }
        console.log(data);
    })
};

// Job start req
app.post('/start', function (req, res) {
    // Get the image IDs for processing
    var idData = req.files;
    var images = [];
    for (var imageName in idData) {
        images.push(idData[imageName]);
    }
    if (images.length > 0) {
        return res.send('Some image IDs received');
    } else {
        return res.send('Need to specify images for job');
    }

    /*if (req.files) {
        console.log('File exists');
        // console.log(req.files);
        console.log('Num files: ' + Object.keys(req.files).length)

    } else {
        console.log('File does not exist');
    }
    return res.send("Some image thing recieved\n");*/
});

// Job progress check
app.get('/progress', function (req, res) {
    var jobID = req.get('jobID');
    if (jobID) {
        console.log('Job progress req: jobID ' + jobID);
        // TODO: Query job server
        var progress = 0.74;
        return res.send({ 'progress': progress });
    }
    else {
        return res.send('No jobID provided');
    }
});

// Job results
app.get('/results', function (req, res) {
    var jobID = req.get('jobID');
    if (jobID) {
        console.log('Job results req: jobID ' + jobID);
        // TODO: Query job server
        return res.send({ 'data': [{ 'some': 'data' }, { 'some more': 'data' }] });
    }
    else {
        return res.send('No jobID provided');
    }
});

// Start listening
port = process.env.PORT || 5000;

app.listen(port, function() {
    return console.log("Listening on " + port);
});


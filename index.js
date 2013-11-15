var Strategy, app, express, fs, mysql, conn, path, port, stuffDict;

express = require('express');
path = require('path');
fs = require('fs');
mysql = require('mysql');

// Init express application
app = express();

app.configure(function () {
    app.use(express.static('public'));
    //app.use(express.logger());
    app.use(express.bodyParser());
    app.use(app.router);
});

stuffDict = {};

// Init DB conn
conn = mysql.createConnection({
    host:       'localhost',
    user:       'serv',
    password:   'pass'
});

// TEMP Hello world
app.get('/', function(req, res) {
    return res.send('Hello World!\n');
});

conn.connect(function (err) {
    // Connected, unless 'err' is set
    if (err) {
        console.log('Unable to connect to MySQL DB:\n' + err);
        process.exit(1);
    }
    else {
        console.log('Connected to MySQL DB!');
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
    console.log(req);
    return res.send('Ack');
});

// Job start req
app.post('/start', function (req, res) {
    // Get the image IDs for processing
    var idData = req.get('images');

    if (idData) {
        var imageIDs = idData.split(',');
        console.log(imageIDs);
        return res.send('Some image IDs received');
    }
    else {
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


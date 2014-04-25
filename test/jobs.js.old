var assert = require('assert');
var http = require('http');
var app = require('../src/main.js');
var testSettings = require('testConfig.json');
var port = 5000;
var sessionCookie = null;

function defaultGetOptions(path) {
  var options = {
    "host": "localhost",
    "port": port,
    "path": path,
    "method": "GET",
    "headers": {
      "Cookie": sessionCookie
    }
  };
  return options;
}

describe('app', function () {
	
	before (function (done) {
		app.listen(port, function (err, result) {
			if (err) {
				done(err);
			} else {
				done();
			}
		});

		after (function (done) {
			app.close();
		});

		it('should exist', function (done) {
			should.exist(app);
			done();
		});

		it('should be listening at localhost:5000', function (done) {
			var headers = defaultGetOptions('/');
			http.get(headers, function (res) {
				res.statusCode.should.eql(404);
				done();
			});
		});

		// it('should try to login a user that does not exist', function (done) {
		// 	var queryString = {"email": "totallyDoesNotExist@lol.com",
		// 					   "pass": "incrediblySecret"};
		// 	var options = defaultGetOptions('/login');
		// 	var req = http.request(options, function (res) {
				
		// 	});
		// });

	});

});






var path = require('path');
var fs = require('fs');
var _ = require('underscore');
var md5 = require('MD5');
var aws = require('aws-sdk');

var s3 = new aws.S3();

function fileType(filePath) {
    filetype = ""
    for (var i = filePath.length; i > 0; i--) {
        if (filePath[i] === '.') {
            return filePath.slice(i + 1, filePath.length);
        }
    }
    return null;
}

function proxyImage(id, res) {
    var params = {'Bucket':'citizen.science.image.storage', 'Key':id};
    s3.getObject(params).createReadStream().pipe(res);
};

function imageRoutes(app, db, auth) {
    // Endpoint to get list of images
    app.get('/images', auth.enforceLogin, function(req, res) {
	db.getUserImages(req.user, function(err, result) {
	    if (err) {
		res.send({'res':false, 'err':{'code':2, 'msg':'Could not load image list.'}});
	    } else {
		res.send({'res':true, 'images':result});
	    }
	});
    });

    app.get('/img/:id', function(req, res) {
	//req.params.id
	// TODO: Allow logged out viewing of public images
	if (req.user) {
	    db.checkImagePerm(req.user, req.params.id, function(err, bool) {
		if (bool) {
		    proxyImage(req.params.id, res);
		} else {
		    res.redirect('/Padlock.png');
		}
	    });
	} else {
	    res.redirect('/Padlock.png');
	}
    });

    // Image/s upload endpoint
    // Uses express.multipart - this is deprecated and bad! TODO: Replace me!
    app.post('/upload/img', auth.enforceLogin, function (req, res, next) {
	var resultObject = {};
	resultObject.status = {};

	var idData = req.files;
	var images = [];
	for (var imageName in idData) {
            images.push(idData[imageName]);
	}
	if (images.length > 0) {
            // resultObject.status.code = 0;
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
		uploadImage(req.user, imageObject);
            }
	} else {
            resultObject.status.code = 1;
            resultObject.status.message = "No images uploaded";
	}
	return res.send(resultObject);
    });

    // app.get('img/:name')

    function uploadImage(user, imageObject) {
	params = {};
	params.Bucket = 'citizen.science.image.storage';
	params.Body = imageObject.imageData;
	params.Key = imageObject.imageHash;
	s3.putObject(params, function (err, data) {
            if (err) {
		console.log("uploadImage error: " + err);
            } else {
		db.addNewImage(user, {'id':1, 'name':'dummy'}, imageObject);
	    }
            console.log(data);
	})
    };
}

module.exports = {imageRoutes:imageRoutes};

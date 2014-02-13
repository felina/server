var _ = require('underscore');

function parseRegion(reg) {
    for (var i = 0; i < reg.length; i++) {
	if (reg[i] == null || typeof reg[i].x !== 'number' ||
	    typeof reg[i].y !== 'number' || reg[i].x < 0 || reg[i].y < 0) {
	    reg = false;
	}
    }
}

function parseAnnotations(an) {
    for (var i = 0; i < an.length; i++) {
	if (typeof an[i].tag !== 'string' || an[i].tag == null ||
	    an[i].tag.length < 1 || an[i].tag.length > 32) {
	    an[i].tag = false;
	}
	if (_.isArray(an[i].region)) {
	    parseRegion(an[i].region);
	} else {
	    an[i] = false;
	}
    }
}

function parseMetadata(mdArr) {
    if (!_.isArray(req.body)) {
	return [];
    } else {
	// This is very un-node like. array.forEach(...)!
	for (var i = 0; i < req.body.length; i++) {
	    if (typeof mdArr[i].id === 'number' && mdArr[i].id != null && mdArr[i].id >= 0) {
		if (typeof mdArr[i].datetime === 'string') {
		    mdArr[i].datetime = Date.parse(mdArr[i].datetime);
		    if (isNaN(mdArr[i].datetime)) {
			console.log('Failed to parse datetime field.');
			mdArr[i].datetime = false;
		    } else {
			mdArr[i].datetime = new Date(mdArr[i].datetime);
		    }
		} else {
		    mdArr[i].datetime = null;
		}
		if (typeof mdArr[i].location !== 'undefined' && typeof mdArr[i].location !== 'object' ||
		    mdArr[i].location == null || typeof mdArr[i].location.lat !== 'number' ||
		    typeof mdArr[i].location.lon !== 'number' || mdArr[i].location.lat < -90 ||
		    mdArr[i].location.lat > 90 || mdArr[i].location.lon > -180 || mdArr[i].location.lon > 180) {
		    // Location attribute is invalid or not present
		    mdArr[i].location = false;
		}
		if (typeof mdArr[i].priv !== 'undefined' && typeof mdArr[i].priv !== 'boolean') {
		    mdArr[i].priv = false;
		}
		if (mdArr[i].annotations != null && !_.isArray(mdArr[i].annotations)) {
		    mdArr[i].annotations = false;
		} else {
		    mdArr[i].annotations = parseAnnotations(mdArr[i].annotations);
		}
	    }
	}
    }
}
		   
		   

function metaRoutes(app, auth, db) {
    app.post('/upload/metadata', auth.enforceLogin, function(req, res) {
	// Check that we've been sent an array
	
	res.send('lolwut\n');
    });

    function saveMetadata() {
	console.log('Adding md to db.');
	db.addImageMeta(id, datetime, location, priv, function(err, out) {
	    console.log(err);
	    console.log(out);
	    if (err) {
		console.log(err);
		res.send({'res':false, 'err':{'code':1, 'msg':'Failed to save metadata.'}});
	    } else {
		if (annotations.length === 0) {
		    res.send({'res':true});
		} else {
		    db.addImageAnno(annotations, function (err2, out2) {
			if (err2) {
			    console.log(err);
			    res.send({'res':false, 'err':{'code':2, 'msg':'Failed to save annotations.'}});
			} else {
			    res.send({'res':true});
			}
		    });
		}
	    }
	});
    }

    app.get('/img/:id/meta', function(req, res) {
	// TODO: Allow logged out viewing
	if (req.user) {
	    db.checkImagePerm(req.user, req.params.id, function(err, bool) {
		if (bool) {
		    db.getMetaBasic(req.user.id, req.params.id, function (err, meta) {
			if (err) {
			    res.send({'res':false, 'err':{'code':2, 'msg':'Failed to retrieve metadata.'}});
			} else {
			    res.send({'res':true, 'meta':meta});;
			}
		    });
		} else {
		    res.send({'res':false, 'err':{'code':1,'msg':'You do not have permission to access this image.'}});
		}
	    });
	} else {
	    res.send({'res':false, 'excuse':'I AM BROKEN AND YOURE NOT LOGGED IN'});
	}
    });

    app.get('/img/:id/anno', function(req, res) {
	// Dummy data return
	// Should we enforce login here?
	res.send({'res':true, 'annotations':
		  [
		      {
			  'region': [{'x':20, 'y':40}, {'x':20, 'y':10}, {'x':40, 'y':10}, {'x':40, 'y':40}],
			  'tag': 'face'
		      }
		  ]
		 });
    });

    app.put('/img/:id/anno', /*auth.enforceLogin,*/ function(req, res) {
	console.log(req.body.annotations);
	addImageAnno(req.body.annotations, function(err, out) {
	    if (err) {
		res.send({'res':false, 'err':{'code':1, 'msg':'Failed to store annotations.'}});
	    } else {
		res.send({'res':true});
	    }
	});
    });
}

module.exports = {metaRoutes:metaRoutes};

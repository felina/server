var _ = require('underscore');

function isUnset(x) {
    return  _.isUndefined(x) || _.isNull(x);
}

function parseRegion(reg) {
    // We should have already checked the size of this array.
    for (var i = 0; i < reg.length; i++) {
	if (reg[i] == null || typeof reg[i].x !== 'number' ||
	    typeof reg[i].y !== 'number' || reg[i].x < 0 || reg[i].y < 0) {
	    // If any point is invalid, invalidate the entire region.
	    console.log('Invalid point in region.');
	    return false;
	}
    }
    return true;
}

function parseAnnotations(an) {
    // An empty array is valid, so we just return.
    for (var i = 0; i < an.length; i++) {
	// Region must be set and must be an array of size > 0
	if (_.isArray(an[i].region) && an[i].region.length > 0) {
	    var valid = parseRegion(an[i].region);
	    
	    if (!valid) {
		an[i] = false;
	    } else if (isUnset(an[i].tag)) {
		an[i].tag = null;
	    } else if (typeof an[i].tag !== 'string' || an[i].tag.length < 1 || an[i].tag.length > 32) {
		an[i].tag = false;
	    }
	} else {
	    an[i] = false;
	}
    }
}

function parseMetadata(mdArr) {
    console.log(mdArr);
    if (!_.isArray(mdArr)) {
	console.log('Metadata not a list.');
	return false;
    } else {
	// This is very un-node like. array.forEach(...)!
	for (var i = 0; i < mdArr.length; i++) {
	    if (typeof mdArr[i].id === 'string' && mdArr[i].id != null && mdArr[i].id.length === 32) {
		// Check if datetime has been sent
		if (!isUnset(mdArr[i].datetime)) {
		    mdArr[i].datetime = Date.parse(mdArr[i].datetime);
		    if (isNaN(mdArr[i].datetime)) {
			console.log('Failed to parse datetime field.');
			// Mark as invalid
			mdArr[i].datetime = false;
		    } else {
			// Convert to Date object.
			mdArr[i].datetime = new Date(mdArr[i].datetime);
		    }   
		} else {
		    // Mark as unset
		    mdArr[i].datetime = null;
		}

		// Check if location has been sent 
		if (!isUnset(mdArr[i].location)) {
		    if (typeof mdArr[i].location !== 'object' || typeof mdArr[i].location.lat !== 'number' ||
			typeof mdArr[i].location.lon !== 'number' || mdArr[i].location.lat < -90 ||
			mdArr[i].location.lat > 90 || mdArr[i].location.lon > -180 || mdArr[i].location.lon > 180) {
			console.log('Invalid location.');
			// Mark as invalid
			mdArr[i].location = false;
		    }
		} else {
		    // Mark as unset
		    mdArr[i].location = null;
		}

		// Check if priv has been sent
		if (!isUnset(mdArr[i].priv)) {
		    // Accept any type for priv, convert to a simple boolean.
		    mdArr[i].priv = !!mdArr[i].priv;
		} else {
		    // Mark as unset
		    mdArr[i].priv = null;
		}

		// Check if annotations have been sent
		if (!isUnset(mdArr[i].annotations)) {
		    if (!_.isArray(mdArr[i].annotations)) {
			console.log('Invalid annotations.');
			mdArr[i].annotations = false;
		    } else {
			// Parse annotations list
			parseAnnotations(mdArr[i].annotations);
		    }
		} else {
		    // Mark as unset
		    mdArr[i].annotations = [];
		}
	    } else {
		console.log('No id specified for metadata.');
		mdArr[i] = false;
	    }
	}
    }
    return mdArr;
}

function metaRoutes(app, auth, db) {

    // Takes an array of metadata objects (JSON). A metadata object must contain a 32 character id string,
    // and any combination of the following:
    //   - datetime : A string representing the date an image was captured. Create using (new Date).toJSON()
    //   - location : An object containing two numbers, lat and lon. Must be within +-90 and +-180 respectively.
    //   - private  : A boolean value determining whether other users may view this image.
    //   - annotations : A list containing annotation objects.
    // An annotation object is comprised of two properties:
    //   - tag    : (OPTIONAL) A string that describes the annotation. Will be replaced with an id in future.
    //   - region : A list containing at least one point object, where a point simply wraps two numbers, x and y.
    // The four properties of a metadata object are all optional. If you do not wish to set one of these properties,
    // the property should be left undefined or set to null.
    app.post('/upload/metadata', /*auth.enforceLogin,*/ function(req, res) {
	// Check that we've been sent an array
	parseMetadata(req.body);
	saveMetadata(req.body, res);
//	res.send(req.body);
    });

    function saveMetadata(mdArr, res) {
	console.log('Adding md to db.');
	parseMetadata(mdArr);

	db.addImageMeta(mdArr, function(qArr) {
	    console.log(qArr);
	    res.send(qArr);
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

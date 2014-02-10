function metaRoutes(app, auth, db) {
    app.post('/upload/metadata', auth.enforceLogin, function(req, res) {
	// Check that we've been sent an array
	if (_.isArray(req.body)) {
	    var md = null;
	    // This is very un-node like. array.forEach(...)!
	    for (var i = 0; i < req.body.length; i++) {
		md = req.body[i];
		console.log(md.id);
		var id = null;
		if (md.id) {
		    id = md.id;
		    var datetime = null;
		    if (md.datetime) {
			datetime = md.datetime;
		    }
		    var location = null;
		    if (md.location) {
			location = md.location;
		    }
		    var priv = true;
		    if (md.priv) {
			priv = md.priv;
		    }
		    var annotations = [];
		    if (md.annotations && _.isArray(md.annotations)) {
			annotations = md.annotations;
		    }
		    console.log('Adding md to db.');
		    db.addImageMeta(id, datetime, location, priv, annotations, function(err, out) {
			console.log(err);
			console.log(out);
		    });
		} else {
		    // No id specified! Mark as error.
		    console.log('Metadata missing id!');
		}
	    }
	} else {
	    // Not sent a list!
	    console.log('Not a metadata list!');
	}
	res.send('lolwut\n');
    });

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

    app.put('/img/:id/anno', function(req, res) {
	// Dummy data accept
	console.log(req.body.annotations);
	res.send({'res':true});
    });
}

module.exports = {metaRoutes:metaRoutes};

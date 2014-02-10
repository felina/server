var passport = require('passport');
var fbStrat = require('passport-facebook').Strategy;
var fbConfig = require('./fb.json');
var users = require('./user.js');;
var db = require('./db.js');

// Make sure that passReq is enabled in fbConfig
fbConfig.passReqToCallback = true;
var FacebookStrategy = new fbStrat(fbConfig, function(req, accessToken, refreshToken, profile, done) {
    db.extGetUser(profile.id, profile.provider, req.user, function(outcome, user) {
	switch (outcome) {
	case 0:
	    // Login succeeded or we were already done.
	    return done(null, user);
	    break;
	case 1:
	    // This FB account has been seen before with another user! Invalidate session.
	    return done(JSON.stringify);
	    break;
	case 2:
	    // This account is new, it has been linked to the current user.
	    return done(null, user);
	    break;
	case 3:
	    // New user, UNSUPPORTED
	    return done(JSON.stringify({'code':2, 'msg':'Unsupported new user'}), null);
	    break;
	default:
	    // ???
	    return done('Facebook login failed');
	    break;
	}
    });
});

function fbRoutes(app) {
    // Facebook auth routes
    app.get('/login/facebook', passport.authenticate('facebook'));
    app.get('/login/facebook/callback', passport.authenticate('facebook', {successRedirect: '/logincheck', failureRedirect: '/logincheck'}));
    // End Facebook auth
}

module.exports = {fbStrategy:FacebookStrategy, fbRoutes:fbRoutes};
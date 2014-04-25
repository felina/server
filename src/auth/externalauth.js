/**
 * @module externalauth
 */

var passport = require('passport');
var fbStrat = require('passport-facebook').Strategy;
var db = require('../db.js');

/**
 * The Facebook app configuration.
 */
var fbConfig = require('../../config/fb.json');

// Make sure that passReq is enabled in fbConfig
fbConfig.passReqToCallback = true;

/**
 * Instantiation of the Passport-Facebook Strategy, using a custom callback function to retrieve our internal user.
 */
var FacebookStrategy = new fbStrat(fbConfig, function(req, accessToken, refreshToken, profile, done) {
    db.extGetUser(profile.id, profile.provider, req.user, function(outcome, user) {
        switch (outcome) {
        case 0:
            // Login succeeded or we were already done.
            return done(null, user);
        case 1:
            // This FB account has been seen before with another user! Invalidate session.
            return done(JSON.stringify);
        case 2:
            // This account is new, it has been linked to the current user.
            return done(null, user);
        case 3:
            // New user, UNSUPPORTED
            return done(JSON.stringify({'code':2, 'msg':'Unsupported new user'}), null);
        default:
            // ???
            return done('Facebook login failed');
        }
    });
});

/***
 ** API ROUTE FUNCTIONS
 **/

/**
 * API endpoint to login, associate, or register accounts related to a Facebook account.
 * @TODO This is barely functional
 * @hbcsapi {GET} /login/facebook - This is an API endpoint.
 * @returns {BasicAPIResponse} The API response detailing what the outcome of the Facebook authentication was.
 */
function getLoginFacebook(req, res, next) {
    passport.authenticate('facebook')(req, res, next);
}

/**
 * Registers Express routes related to Facebook authentication. These include API endpoints, as well as endpoints
 * required for authentication with Facebook.
 * @static
 * @param {Express} app - The Express application object.
 */
function fbRoutes(app) {
    app.get('/login/facebook', getLoginFacebook);

    /**
     * Callback endpoint to complete the authentication process.
     */
    app.get('/login/facebook/callback', [require('express').urlencoded(), passport.authenticate('facebook', {successRedirect: '/logincheck', failureRedirect: '/logincheck'})]);
}

// Export all public members.
module.exports = {
    fbStrategy:FacebookStrategy,
    fbRoutes:fbRoutes
};

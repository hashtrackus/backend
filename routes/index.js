'use strict';
var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
var Twit = require('twit');
var Tweet = require('../models/tweet.js');
var User = require('../models/user.js');
var md5 = require('md5');
var api_key = process.env.MAILGUN_KEY;
var domain = process.env.MAILGUN_DOMAIN;
var mailgun = require('mailgun-js')({ apiKey: api_key, domain: domain });
var dataProcessing = require('../dataProcessing');

var cors = require('cors');
var stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

import pg from 'pg';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';

let conString = 'postgres://localhost/htu';

pg.connect(conString, (err, client, done) => {

  passport.use(new LocalStrategy({
      usernameField: 'email',
      passwordField: 'password'
    },
    function(username, password, done) {
      let email = username;
      client.query('SELECT * from users where email = $1 limit 1', [email], (err, result) => {
        if (err) { return done(err); }
        if (!result || !result.rows) {
          return done(null, false, { message: 'Incorrect username.' });
        }
        let user = result.rows[0]
        if (user.password !== password) {
          return done(null, false, { message: 'Incorrect password.' });
        }
        // generate a new random token
        user.token = require('crypto').randomBytes(64).toString('hex');

        client.query('update users set current_access_token = $1 where id = $2',
                    [user.token, user.id], (err, result) => {
          let { email, token } = user;
          return done(null, {email, token} );
        })
      });
    }
  ));

  passport.serializeUser(function(user, done) {
    done(null, user.token);
  });

  passport.deserializeUser(function(token, done) {
    client.query('SELECT * from users where current_access_token = $1 limit 1', [token], (err, result) => {
      done(err, result.rows[0]);
    });
  });

  router.get('/', (req, res, next) => {
    client.query('SELECT * from users limit 1', (err, result) => {
      console.log(result.rows[0]);
      res.render("index", { email: result.rows[0].email } );
    });
  });

  router.post('/login', passport.authenticate('local'), function(req, res) {
    res.json(req.user);
  });

});

router.get('/dashboard/:hash', function(req, res, next) {
  console.log(req.params);
  User.findOne({userHash: req.params.hash}, function(err, user) {
    if (err) {
      res.status(404);
    }
    else if (!user) {
      res.status(404);
      res.redirect('/');
    }
    console.log(user.searchTerms[0].tweetIds);
    Tweet.find({'_id': {$in: user.searchTerms[0].tweetIds}}, function(err, tweets) {
      console.log(err, tweets);
      if (err) {
        res.status(404);
      }
      res.json(tweets);
    });
  });
});


router.get('/statistics', function(req, res, next) {
  // pass in the search term
  var currentTime = new Date().getTime();
  var dayLength = 86400000;
  var previousDay = currentTime - dayLength;
  Tweet.find({time_num: {$gte: previousDay}}).exec(function(err, tweets) {
    if(err) {
      console.log(err);}
    var results = {
      numberOfTweets: tweets.length,
      avgSentiment: dataProcessing.sentimentOverTime(tweets)
    };
    res.json(results);
  });
  // Tweet.find => within last 24 hours
  // analyze data
  // res.json data
});

router.post('/theMoney', function(req, res, next) {
  var email = req.body.email;
  var userHash = md5(email);
  var data = {
    from: 'Excited User <no-reply@hashtrack.us>',
    to: email,
    subject: 'Thanks for signing up to HashTrack.us!',
    text: "Welcome to HashTrack.us! You are now tracking " + req.body.searchTerm +
          "\n\nView your dashboard at http://hashtrack.us/#!/dashboard" + userHash +
          "\n\n Happy Tracking! \n HackTrack.us Team"
  };

  var saveUser = {
    email: email,
    userHash: userHash
  };

  stripe.charges.create({
    amount: 995,
    currency: "usd",
    source: req.body.token,
    metadata: { userEmail: email, searchTerm: req.body.searchTerm }
  }, function(err, charge) {
    if (err) {
      console.error(err);
      res.status(400).json({ error: "Payment failed" });
      return;
    }
    saveUser.searchTerms = [];
    saveUser.searchTerms[0] = {};
    saveUser.searchTerms[0].term = req.body.searchTerm;
    var newUser = new User(saveUser);
    newUser.save(function(err, user) {
      if (err) {
        console.error(err);
        res.status(400).json({ error: "Validation failed" });
        return;
      }
      mailgun.messages().send(data, function (error, body) {
        if(error){
          console.error(error);
          res.status(500).json({ error: error });
          return;
        }
        res.json(user);
      });
    });

  });

});

module.exports = router;

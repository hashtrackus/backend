'use strict';
var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
var Twit = require('twit');
var Tweet = require('../models/tweet.js');
var User = require('../models/user.js');
console.log("Tweet:", Tweet);
console.log("User:", User);


router.get('/data', function(req, res, next) {
  console.log("data hit");
  // console.log(Tweet);
  Tweet.find({}, function(err, tweets){
    if(err){console.log(err);}
    // console.log(tweets);
    res.json(tweets);
  });
  // return;
});

router.get('/statistics', function(req, res, next) {
  // pass in the search term
  var currentTime = new Date().getTime();
  var dayLength = 86400000;
  var previousDay = currentTime - dayLength;
  Tweet.find({time_num: {$gte: previousDay}}).limit(10).exec(function(err, tweets) {
    if(err){console.log(err);}
    console.log(tweets);
    res.json(tweets);
  });
  // Tweet.find => within last 24 hours
  // analyze data
  // res.json data
});

router.post('/theMoney', function(req, res, next) {
  console.log(req.body);
  res.json(req.body);
});

module.exports = router;

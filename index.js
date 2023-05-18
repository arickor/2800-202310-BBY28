// Dependencies
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");
const MongoStore = require("connect-mongo");
require("dotenv").config();
const url = require("url");
const Papa = require("papaparse");

const app = express();

const path = require('path');

const Joi = require("joi");
const { database } = require("./dbconnection");

app.set("view engine", "ejs");

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const port = process.env.PORT || 8000;

const node_session_secret = process.env.NODE_SESSION_SECRET; // put your secret here

const userCollection = database.db(mongodb_database).collection("users");
const gameCollection = database.db(mongodb_database).collection("games");

const expireTime = 60 * 60 * 1000; // 1 hour in milliseconds
const saltRounds = 10;

app.use(express.urlencoded({ extended: false }));

var mongoStore = MongoStore.create({
  mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}`,
  crypto: {
    secret: mongodb_session_secret,
  },
});

app.use(
  session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true,
  })
);

function sessionAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    res.redirect("/login");
  }
}

app.get("/", (req, res) => {
  res.render("index", {
    username: req.session.username,
    email: req.session.email,
  });
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post("/loggingin", async (req, res) => {
  var email = req.body.email;
  var password = req.body.password;

  const schema = Joi.string().email().required();
  const validation = schema.validate(email);
  if (validation.error != null) {
    console.log(validation.error);
    res.redirect("/login");
    return;
  }
  const result = await userCollection
    .find({ email: email })
    .project({ email: 1, password: 1, username: 1, _id: 1 })
    .toArray();
  console.log(result);
  if (result.length == 0) {
    console.log("email not found");
    res.redirect("/login");
    return;
  }
  if (await bcrypt.compareSync(password, result[0].password)) {
    console.log("password match");
    req.session.authenticated = true;
    req.session.email = email;
    req.session.username = result[0].username;
    req.session.cookie.maxAge = expireTime;
    res.redirect("/");
  } else {
    console.log("password mismatch");
    res.redirect("/login");
  }
});

app.get('/signup', (req, res) => {
  res.render('signup');
});

app.post("/signingup", async (req, res) => {
  var username = req.body.username;
  var password = req.body.password;
  var email = req.body.email;
  if (!username || !password || !email) {
    res.send(`Please enter all fields
        <a href="/signup">Go back</a>`);
  } else {
    const schema = Joi.object({
      username: Joi.string().max(30).required(),
      email: Joi.string().email().required(),
      password: Joi.string().max(30).required(),
    });
    const validation = schema.validate({ username, email, password });
    if (validation.error != null) {
      console.log(validation.error);
      res.redirect("/signup");
      return;
    }
    var user = await userCollection.findOne({ username: username });
    if (user) {
      res.send(`User already exists
            <a href="/signup">Go back</a>`);
    } else {
      var encryptedPassword = await bcrypt.hash(password, saltRounds);
      var newUser = {
        username: username,
        password: encryptedPassword,
        email: email,
      };
      await userCollection.insertOne(newUser);
      req.session.authenticated = true;
      req.session.email = email;
      req.session.username = username;
      req.session.cookie.maxAge = expireTime;
      res.redirect("/");
    }
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.post("/createProfile", sessionAuth, (req, res) => {
  res.render("createProfile", {
    username: req.session.username,
    email: req.session.email,
  });
});

app.post("/saveProfile", sessionAuth, async (req, res) => {
  var newPassword = req.body.password;
  if (newPassword) {
    var encryptedPassword = await bcrypt.hash(newPassword, saltRounds);
    await userCollection.updateOne({username: req.session.username}, {$set: {password: encryptedPassword}});
  }
  await userCollection.updateOne(
    { username: req.session.username },
    { $set: { primaryGamingPlatform: req.body.primaryGamingPlatform } }
  );
  req.session.primaryGamingPlatform = req.body.primaryGamingPlatform;
  res.render("saveProfile", {
    username: req.session.username,
    email: req.session.email,
    primaryGamingPlatform: req.session.primaryGamingPlatform
  });
});

app.get("/processcsv", async (req, res) => {
  
  Papa.parse(fs.createReadStream('games_of_all_time.csv'), {
    header: true,
    step: async function(results, parser) {
        console.log("Row data:", results.data);
        await gameCollection.insertOne({game_name: results.data.game_name,
            meta_score: results.data.meta_score,
            user_score: results.data.user_score,
            platform: results.data.platform,
            description: results.data.description,
            url: results.data.url,
            developer: results.data.developer,
            genre: results.data.genre,
            type: results.data.type,
            rating: results.data.rating
        });
    },
    complete: function(results) {
        console.log("done parsing");
    }
  }
  );
  res.send("done");
});

app.use(express.static(__dirname + "/public"));

app.get("*", (req, res) => {
  res.status(404);
  res.send("404");
});

app.listen(port, () => {
  console.log("Server running on port: " + port);
});
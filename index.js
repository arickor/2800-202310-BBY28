// Dependencies
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const MongoStore = require('connect-mongo');
require('dotenv').config();
const url = require('url');

const app = express();

const Joi = require("joi");
const { database } = require('./dbconnection');

app.set('view engine', 'ejs');

/* secret information section */
const mongodb_host = process.env.MONGODB_HOST;
const mongodb_user = process.env.MONGODB_USER;
const mongodb_password = process.env.MONGODB_PASSWORD;
const mongodb_database = process.env.MONGODB_DATABASE;
const mongodb_session_secret = process.env.MONGODB_SESSION_SECRET;

const port = process.env.PORT || 8000;

const node_session_secret = process.env.NODE_SESSION_SECRET; // put your secret here

const userCollection = database.db(mongodb_database).collection("users");

const expireTime = 60 * 60 * 1000; // 1 hour in milliseconds
const saltRounds = 10;

app.use(express.urlencoded({extended: false}));

var mongoStore = MongoStore.create({
	mongoUrl: `mongodb+srv://${mongodb_user}:${mongodb_password}@${mongodb_host}/${mongodb_database}`,
	crypto: {
		secret: mongodb_session_secret
	}
})

app.use(session({
    secret: node_session_secret,
    store: mongoStore,
    saveUninitialized: false,
    resave: true
}    
));

function sessionAuth(req,res,next){
    if(req.session.authenticated){
        next();
    }else{
        res.redirect("/login");
    }
}

app.get("/",(req,res)=>{
    res.send("Hello World");
});

app.get("/login",(req,res)=>{
    res.send("login");
}
);

app.post("/loggingin",(req,res)=>{
    res.send("loggingin");
});

app.get("/signup",(req,res)=>{
    res.send(`
    <form action="/signingup" method="POST">
    <input type="text" name="username" placeholder="username">
    <input type="email" name="email" placeholder="email">
    <input type="password" name="password" placeholder="password">
    <button type="submit">signup</button>
    </form>`);
});

app.post("/signingup",async (req,res)=>{
    var username = req.body.username;
    var password = req.body.password;
    var email = req.body.email;
    if (!username || !password || !email){
        res.send(`Please enter all fields
        <a href="/signup">Go back</a>`);
    }else{
        const schema = Joi.object({
            username: Joi.string().max(30).required(),
            email: Joi.string().email().required(),
            password: Joi.string().max(30).required()
        });
        const validation = schema.validate({username, email, password});
        if (validation.error != null) {
            console.log(validation.error);
            res.redirect('/signup');
            return;
        }
        var user = await userCollection.findOne({username: username});
        if(user){
            res.send(`User already exists
            <a href="/signup">Go back</a>`);
        }else{
            var encryptedPassword = await bcrypt.hash(password,saltRounds);
            var newUser = {
                username: username,
                password: encryptedPassword,
                email: email
            }
            await userCollection.insertOne(newUser);
            req.session.authenticated = true;
            req.session.email = email;
            req.session.username = username;
            req.session.cookie.maxAge = expireTime;
            res.redirect("/createprofile");
        }
    }
});

app.get("/createprofile",sessionAuth,(req,res)=>{
    res.send("createprofile");
});

app.use(express.static(__dirname + "/public"));

app.get("*", (req,res) => {
	res.status(404);
	res.send('404');
})

app.listen(port, () => {
    console.log("Server running on port: " + port);
});
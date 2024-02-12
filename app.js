const express = require("express");
const bodyParser = require("body-parser");
const session = require('express-session');
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const axios = require("axios");
const NewsAPI = require('newsapi');
const User = require('./models/User');
const newsapi = new NewsAPI('1b58199553b442149b940dd958002fce');

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));


app.use(session({
    secret: '1234',
    resave: false,
    saveUninitialized: true
}));
app.set('view engine', 'ejs');

const dbUrl = "mongodb+srv://amirzhanmukhidinov572:5636nkC@cluster0.vl8mbol.mongodb.net/backend";
const connectionParams = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
};

mongoose.connect(dbUrl, connectionParams)
    .then(() => console.info("Connected to the database"))
    .catch((e) => console.log("Error connecting to the database", e));

app.get("/", function (req, res) {
    res.render("index", { userIsLoggedIn: req.session.user });
});

app.get("/login", function (req, res) {
    res.render("login", { error: null });
});

app.post("/login", async function (req, res) {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ username });

        if (user && !user.deletedAt && (await bcrypt.compare(password, user.password))) {
            req.session.user = { username: user.username, searchHistory: user.searchHistory, isAdmin: user.isAdmin };

            if (user.isAdmin) {
                res.redirect("/admin");
            } else {
                res.redirect("/"); 
            }
        } else {
            res.render("login", { error: "Invalid username or password" });
        }
    } catch (error) {
        console.error("Error during login:", error);
        res.render("login", { error: "An error occurred. Please try again." });
    }
});


app.get("/registration", function (req, res) {
    res.render("registration", { error: null });
});

app.post("/registration", async function (req, res) { 
    const { username, password } = req.body; 
 
    try { 
        const hashedPassword = await bcrypt.hash(password, 10); 
        const newUser = new User({ username, password: hashedPassword, searchHistory: [] }); 
        await newUser.save(); 
 
        res.redirect("/login"); 
    } catch (error) { 
        console.error("Error during registration:", error); 
        res.render("registration", { error: "An error occurred. Please try again." }); 
    } 
});


app.get("/admin", async function (req, res) {
    try {
        const users = await User.find({});
        res.render("admin", { users });
    } catch (error) {
        console.error("Error fetching users:", error);
        res.send("An error occurred while fetching user data.");
    }
});


app.get("/admin/add", function (req, res) {
    res.render("addUser");
});


app.post("/admin/add", async function (req, res) {
    const { username, password, isAdmin } = req.body;

    try {
        const isAdminValue = isAdmin === 'true';

        const newUser = new User({
            username,
            password: await bcrypt.hash(password, 10), 
            isAdmin: isAdminValue,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        await newUser.save();

        res.redirect("/admin");
    } catch (error) {
        console.error("Error adding user:", error);
        res.send("An error occurred while adding user.");
    }
});


app.post("/admin/edit/:userId", async function (req, res) {
    const userId = req.params.userId;
    const { username, newPassword, isAdmin } = req.body;

    try {
        const updateObject = {
            username,
            updatedAt: Date.now(),
            isAdmin: isAdmin === 'true',
        };

        if (newPassword) {
            updateObject.password = await bcrypt.hash(newPassword, 10);
        }

        await User.findByIdAndUpdate(userId, updateObject);

        res.redirect("/admin");
    } catch (error) {
        console.error("Error updating user:", error);
        res.send("An error occurred while updating user.");
    }
});



app.get("/admin/edit/:userId", async function (req, res) {
    const userId = req.params.userId;

    try {
        const user = await User.findById(userId);
        res.render("editUser", { user });
    } catch (error) {
        console.error("Error fetching user for edit:", error);
        res.send("An error occurred while fetching user data for edit.");
    }
});


app.post("/admin/delete/:userId", async function (req, res) {
    const userId = req.params.userId;

    try {
        await User.findByIdAndUpdate(userId, { deletedAt: Date.now() });

        res.redirect("/admin");
    } catch (error) {
        console.error("Error deleting user:", error);
        res.send("An error occurred while deleting user.");
    }
});

app.get("/logout", function (req, res) {
    req.session.destroy();
    res.redirect("/");
});


function getNews(callback) {
    newsapi.v2.everything({
        q: 'weather', 
        language: 'en',
        pageSize: 5,
        sortBy: 'popularity' 
    }).then(response => {
        const articles = response.articles.map(article => article.title);
        callback(articles);
    }).catch(error => {
        console.error(error);
        callback([]);
    });
}

async function getRandomFact(callback) {
    try {
        const randomFactResponse = await axios.get("http://numbersapi.com/random/trivia");
        const fact = randomFactResponse.data;
        callback([fact]);
    } catch (error) {
        console.error(error);
        callback([]);
    }
}

app.get("/weather", function (req, res) {
    const user = req.session.user;
    if (!user) {
        res.redirect("/login");
        return;
    }

    res.render("weather", { username: user.username, searchHistory: user.searchHistory });
});

app.post("/weather", async function (req, res) {
    const user = req.session.user;
    if (!user) {
        res.redirect("/login");
        return;
    }

    const city = req.body.city;

    user.searchHistory.push(city);
    await User.updateOne({ username: user.username }, { $set: { searchHistory: user.searchHistory } });

    const apiKey = "5644fe5e93b13230aa94f2b62033d99d";
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`;

    try {
        console.log("Fetching weather data for:", city);
        const response = await fetch(url);
        const weatherData = await response.json();

        console.log("Weather data received:", weatherData);
        
        
        
        if (weatherData.cod === "404") {
            console.log("City not found. Please try again.");
            res.send("City not found. Please try again.");
            return;
        }

        const temp = weatherData.main.temp;
        const feels = weatherData.main.feels_like;
        const icon = weatherData.weather[0].icon;
        const iconURL = `https://openweathermap.org/img/wn/${icon}@2x.png`;
        const desc = weatherData.weather[0].description;
        const coords = weatherData.coord;
        const humidity = weatherData.main.humidity;
        const pressure = weatherData.main.pressure;
        const windSpeed = weatherData.wind.speed;
        const country = weatherData.sys.country;
        const rainVolume = weatherData.rain ? weatherData.rain["3h"] : 0;

        const mapURL = `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lon}#map=13/${coords.lat}/${coords.lon}`;

        getNews(function (articles) {
            getRandomFact(function (facts) {
                res.write(`
                    <html lang="en">
                        <head>
                            <title>Results</title>
                            <style>
                                body {
                                    font-family: 'Arial', sans-serif;
                                    background-color: #f8f5f5;
                                    color: black;
                                    margin: 0;
                                    padding: 0;
                                }
                        
                                h1, h2, h3, h4 {
                                    color: rgb(0, 191, 255);
                                }
                        
                                .result-container {
                                    justify-content: space-between;
                                    align-items: flex-start;
                                    postition: relative;
                                    flex-wrap: wrap;
                                    max-width: 90%;
                                    margin: 0 auto;
                                    margin-top: 50px;
                                    padding: 20px;
                                    background-color: #fff;
                                    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                                    border-radius: 8px;
                                    margin-bottom: 80px;
                                }
                        
                                .extra-info {
                                    margin-top: 20px;
                                    font-size: 16px;
                                }
                        
                                #map {
                                    height: 300px;
                                    margin-top: 20px;
                                    flex: 1;
                                    border-radius: 8px;
                                }
                        
                                .additional-info {
                                    margin-top: 20px;
                                    font-size: 16px;
                                    max-width: 1200px;
                                    margin: 0 auto;
                                    padding: 20px;
                                    background-color: #fff;
                                    box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
                                    border-radius: 8px;
                                }
                        
                                .news-container {
                                    margin-top: 20px;
                                }
                        
                                .news-item {
                                    margin-bottom: 10px;
                                    padding-left: 15px;
                                    border-left: 4px solid rgb(0, 191, 255);
                                }
                                 .nav {
                                    list-style-type: none;
                                    width: 100%;
                                    top: 0;
                                    position: fixed;
                                    margin: 0;
                                    padding: 0;
                                    overflow: hidden;
                                    background-color: rgb(0, 191, 255);
                                  }
                                  
                                  .navli {
                                    float: left;
                                  }
                                  
                                  .navlia {
                                    display: block;
                                    color: white;
                                    text-align: center;
                                    padding: 14px 16px;
                                    text-decoration: none;
                                  }
                                  
                                  .navlia:hover:not(.active) {
                                    background-color: rgba(0, 191, 255, 0.697);
                                  }
                                  
                                  .active {
                                    background-color: #0462aa;
                                  }
                            </style>
                            <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
                            <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
                        </head>
                        <body>
                            <ul class="nav">
                                <li class="navli"><a class="navlia" href="/">Home</a></li>
                                <li class="navli" style="float:right"><a class="navlia" href="/login">Login</a></li>
                                <li class="navli" style="float:right"><a class="navlia" href="/registration">Registration</a></li>
                            </ul>
                            <div class="result-container">
                                <div>
                                    <h2 style="text-align: center">The current temperature in ${city} is ${temp}°C</h2>
                                    <div id="map"></div>
                                </div>
                                <div style="display: flex">
                                    <div style="width: 49%">
                                        <p>Feels like: ${feels}°C</p>
                                            <img src='${iconURL}' alt='Weather Icon'>
                                            <p>${desc}</p>
                                        <div class="extra-info">
                                            <p>Coordinates: (${coords.lat}, ${coords.lon})</p>
                                            <p>Humidity: ${humidity}%</p>
                                            <p>Pressure: ${pressure} hPa</p>
                                            <p>Wind Speed: ${windSpeed} m/s</p>
                                            <p>Country: ${country}</p>
                                            <p>Rain Volume (last 1h): ${rainVolume} mm</p>
                                        </div>
                                    </div>
                                    <div style="width: 49%">
                                        <div class="news-container">
                                            <h4>Latest News</h4>
                                            <ul>
                                            ${articles.map(article => `<li>${article}</li>`).join('')}
                                            </ul>
                                        </div>
                                        <div class="facts-container">
                                            <h4>Random Fact</h4>
                                            ${facts.map(fact => `<p class="fact-item">${fact}</p>`).join('')}
                                        </div>
                                    </div>
                                </div>
                            </div>
                                
                            <div style='position: fixed; left:15px; top:50px'>
                                <a href='/'><?xml version="1.0" ?><!DOCTYPE svg  PUBLIC '-//W3C//DTD SVG 1.1//EN'  'http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd'><svg enable-background='new 0 0 15 26' height='26px' id='Layer_1' version='1.1' viewBox='0 0 15 26' width='15px' xml:space='preserve' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'><polygon fill='#231F20' points='12.885,0.58 14.969,2.664 4.133,13.5 14.969,24.336 12.885,26.42 2.049,15.584 -0.035,13.5 '/></svg></a>
                            </div>
                            <footer style="background-color: #333; position: fixed; width: 100%; margin: 0; left: 0; bottom: 0; text-align: center">
                                <h2 style="color: white;">Mukhidinov Amirzhan SE-2207</h2>
                            </footer>
                            <script>
                                var mymap = L.map('map').setView([${coords.lat}, ${coords.lon}], 13);
                                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                                    attribution: '© OpenStreetMap contributors'
                                }).addTo(mymap);
                                L.marker([${coords.lat}, ${coords.lon}]).addTo(mymap)
                                    .bindPopup('${city}')
                                    .openPopup();
                            </script>
                        </body>
                    </html>`
                );

                res.send();
            });
        });
    } catch (error) {
        console.error("Error fetching weather data:", error);
        res.send("An error occurred while fetching weather data.");
    }
});


app.get("/logout", function (req, res) {
    req.session.destroy();
    res.redirect("/");
});


app.get("/", function (req, res) {
    res.render("index");
});

 
app.listen(3000, function () {
    console.log("Server is running on port 3000");
});

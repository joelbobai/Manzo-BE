require("./config/mongodb");
const express = require("express");
const routes = require("./routes");
const cookieParser = require("cookie-parser");
const cors = require("cors");

// Init Express App
const app = express();

app.use(cookieParser());

// Init Dotenv
require("dotenv").config();

// Parse JSON Date
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Allow multiple origins
const allowedOrigins = [
  "http://localhost:3000",
  "https://manzotravels.com",
  "https://www.manzotravels.com",
  "www.manzotravels.com",
  "https://manzo.ng",
  "https://www.manzo.ng",
  "https://manzo.com.ng",
  "https://www.manzo.com.ng",
];

app.use(
  cors({
    credentials: true,
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    origin: function (origin, callback) {
      // Check if the request origin is in the list of allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
  })
);

app.use("/api/v1", routes);

module.exports = app;

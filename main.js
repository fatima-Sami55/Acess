require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;
const session = require("express-session");
const MSSQLStore = require("connect-mssql-v2");
const methodOverride = require("method-override");
const flash = require("connect-flash");
const cookieParser = require("cookie-parser");
require("events").EventEmitter.defaultMaxListeners = 15;
const path = require("path");
const http = require("http").Server(app);
const io = require("socket.io")(http);
global.io = io;
const authentication = require("./routes/Authentication");
const cart = require("./routes/cart");
const shop = require("./routes/shop");
const wish = require("./routes/wish");
const checkout = require("./routes/checkout");
const email = require("./routes/email");
const search = require("./routes/search");
const userInbox = require("./routes/userInbox");
const userProfile = require("./routes/userProfile");
const info = require("./routes/info");
const error = require("./routes/error");
const { poolConnect } = require("./database/data");
const {
  getCurrentNotifications,
} = require("./helper_functions/timeBasedUpdate");

// wrap everything inside async IIFE
(async () => {
  try {
    await poolConnect; // ensure MSSQL is connected
    console.log("✅ MSSQL Connected");

    // SESSION CONFIG (after DB ready)
    const sessionConfig = {
      name: "sessions",
      store: new MSSQLStore({
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        server: process.env.DB_SERVER,
        port: Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        options: {
          encrypt: true,
          trustServerCertificate: true,
        },
      }),
      secret: process.env.SESSION_SECRET || "supersecret",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    };

    //MIDDLEWARE
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(methodOverride("_method"));
    app.use(cookieParser());
    app.use(session(sessionConfig));
    app.use(flash());
    app.use((req, res, next) => {
      res.locals.success = req.flash("success");
      res.locals.error = req.flash("error");
      next();
    });

    // VIEWS
    app.set("view engine", "ejs");
    app.use(express.static(__dirname + "/public"));
    app.use("/users_images", express.static(path.join(__dirname, "users_images")));

    // SOCKET.IO
    io.on("connection", (socket) => {
      getCurrentNotifications();
      socket.on("disconnect", () => {
        console.log("A user disconnected");
      });
    });

    // ROUTES
    app.use("/", authentication);
    app.use("/", cart);
    app.use("/", shop);
    app.use("/", wish);
    app.use("/", checkout);
    app.use("/", email);
    app.use("/", search);
    app.use("/", userInbox);
    app.use("/", userProfile);
    app.use("/", info);
    app.use("/", error);

   
    // START SERVER
    http.listen(port, () => {
      console.log(`🚀 Server running at ${port}`);
    });

  } catch (err) {
    console.error("❌ Failed to start server:", err);
  }
})();

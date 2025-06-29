const express = require("express");
const router = express.Router();
const path = require("path");
const { pool } = require("../database/data");
const sql = require("mssql");
const getUserMiddleware = require("../Middleware/getUser");
const getCartMiddleware = require("../Middleware/getCart");
const getWishMiddleware = require("../Middleware/getWishlist");
const getPurchaseMiddleware = require("../Middleware/getPurchase");
const isAuthenticated = require("../Middleware/is_logged_in");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const validateSignupInput = require("../helper_functions/validation");
const {
  getNoticeCount,
} = require("../helper_functions/timeBasedUpdate");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./public/user_images");
  },
  filename: function (req, file, cb) {
    let extArray = file.mimetype.split("/");
    let extension = extArray[extArray.length - 1];
    cb(null, file.fieldname + "-" + Date.now() + "." + extension);
  },
});
const upload = multer({ storage: storage });

router.use("/public", express.static(path.join(__dirname, "public")));
router.use("/users_images", express.static(path.join(__dirname, "public", "user_images")));

function sanitizeSession() {
  const delSql = `DELETE FROM sessions WHERE JSON_VALUE(data, '$.userId') IS NULL`;
  pool.request().query(delSql).then(() => {
    console.log("cleared session!");
  }).catch((err) => {
    console.error("Error deleting sessions:", err);
  });
}

router.get("/user-profile",isAuthenticated,getUserMiddleware,getWishMiddleware,getCartMiddleware,getPurchaseMiddleware,async (req, res) => {
    const userId = req.session.userId;
    const email = req.loggedInUser.email;

    try {
      // Count user reviews
      const reviewsResult = await pool
        .request()
        .input("user_id", userId)
        .query("SELECT COUNT(*) AS count FROM reviews WHERE user_id = @user_id");

      
      const attemptResult = await pool
  .request()
  .input("email", email)
  .input("userId", userId)
  .query(`
      SELECT COUNT(*) AS attempts
      FROM EmailResendAttempts
      WHERE userId = @userId
      AND attemptAt > DATEADD(HOUR, -24, GETDATE())
  `);

const attempts = attemptResult.recordset[0].attempts;

      const stats = {
        orders: req.purchaseCount,
        wishlist: req.wishItemsCount,
        reviews: reviewsResult.recordset[0].count,
        notifications: getNoticeCount(),
      };
      
      res.render("user", {
        loggedInUser: req.loggedInUser,
        page: "user",
        stats,
        isVerified: req.loggedInUser ? req.loggedInUser.is_verified === true : true,
        resendAttempts: attempts, 
        email: email, 
      });
    } catch (err) {
      console.error("Error fetching profile stats:", err);
      res.status(500).send("Internal Server Error");
    }
  }
);

router.post("/user-profile", isAuthenticated, async (req, res) => {
  const userId = req.session.userId;

  if (!userId) return res.redirect("/home");

  try {
    await pool.request().input("user_id", userId).query("DELETE FROM users WHERE id = @user_id");

    sanitizeSession();

    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).send("Failed to delete session.");
      }
      res.redirect("/home");
    });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).send("An error occurred while deleting the user profile.");
  }
});

router.get("/edit-profile", isAuthenticated, getUserMiddleware, getCartMiddleware, getWishMiddleware, getPurchaseMiddleware, async (req, res, next) => {
  const isLoggedIn = !!req.session.user;
  const userId = req.session.userId;

  try {
    const result = await pool.request()
      .input("id", sql.Int, userId)
      .query("SELECT * FROM users WHERE id = @id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.render("auth/edit", {
      isLoggedIn,
      loggedInUser: req.loggedInUser,
      page: "edit",
      cartItemsCount: req.cartItemsCount,
      wishItemsCount: req.wishItemsCount,
      orderCount: req.purchaseCount,
      notificationCount: getNoticeCount(),
      data: result.recordset[0],
    });
  } catch (err) {
    next(err);
  }
});

router.post("/edit-profile", isAuthenticated, upload.single("img"), async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const {
      firstname = "", lastname = "", email = "", Pass = "",
      phone = "", address = "", city = "", province = "", zip = ""
    } = req.body;

    const userCheck = await pool.request()
      .input("id", sql.Int, userId)
      .query("SELECT * FROM users WHERE id = @id");

    if (userCheck.recordset.length !== 1) {
      return res.json({ error: "User not found or unauthorized" });
    }

    const currentUser = userCheck.recordset[0];

    const checkEmail = await pool.request()
      .input("email", sql.VarChar, email.trim())
      .query("SELECT id FROM users WHERE email = @email");

    if (checkEmail.recordset.length > 0 && checkEmail.recordset[0].id !== userId) {
      return res.json({ error: "That email is already registered. Try logging in instead." });
    }

    // Keep current password if not changed
    let finalPassword = currentUser.Pass;
    if (Pass && Pass.trim()) {
      finalPassword = await bcrypt.hash(Pass.trim(), 10);
    }

    // If no image uploaded, use old one
    const imgPath = req.file
      ? req.file.path.replace(/\\/g, "/").replace("public/", "")
      : currentUser.img;

    // Optionally re-validate inputs if needed
    const { isValid, errors } = validateSignupInput({
      firstname, lastname, email, Pass, phone, address, city, zip
    });

    if (!isValid) {
      return res.json({ error: "Validation failed. Check your inputs." });
    }

    await pool.request()
      .input("id", sql.Int, userId)
      .input("firstname", sql.VarChar, firstname.trim())
      .input("lastname", sql.VarChar, lastname.trim())
      .input("email", sql.VarChar, email.trim())
      .input("Pass", sql.VarChar, finalPassword)
      .input("phone", sql.VarChar, phone.trim())
      .input("address", sql.VarChar, address.trim())
      .input("city", sql.VarChar, city.trim())
      .input("province", sql.VarChar, province.trim())
      .input("zip", sql.VarChar, zip.trim())
      .input("img", sql.VarChar, imgPath)
      .query(`
        UPDATE users SET
          firstname = @firstname,
          lastname = @lastname,
          email = @email,
          Pass = @Pass,
          phone = @phone,
          address = @address,
          city = @city,
          province = @province,
          zip = @zip,
          img = @img
        WHERE id = @id
      `);

    req.session.user = {
      ...currentUser,
      firstname, lastname, email, phone, address, city, province, zip, img: imgPath
    };

    return res.json({ status: "success", redirect: "/user-profile" });

  } catch (err) {
    console.error("Profile update error:", err);
    return res.json({ error: "Something went wrong on the server." });
  }
});


module.exports = router;
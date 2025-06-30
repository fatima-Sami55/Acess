const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const { pool } = require("../database/data");
const baseUrl = process.env.BASE_URL;
const getUserMiddleware = require("../Middleware/getUser");
const getCartMiddleware = require("../Middleware/getCart");
const getWishMiddleware = require("../Middleware/getWishlist");
const getPurchaseMiddleware = require("../Middleware/getPurchase");
const { getNoticeCount } = require("../helper_functions/timeBasedUpdate");
const transporter = require("../helper_functions/email");
const crypto = require("crypto");
const isAuthenticated = require("../Middleware/is_logged_in");
const logEmail = require("../helper_functions/emailLogger");
const validateSignupInput = require("../helper_functions/validation");
const redirectIfAuthenticated = require("../Middleware/is_allowed");
const { storage } = require("../cloudinary/cloudinary");
const upload = multer({ storage });

async function getUserByEmail(email) {
  const result = await pool
    .request()
    .input("email", email)
    .query("SELECT * FROM users WHERE email = @email");

  return result.recordset[0] || null;
}

router.get("/signup",getUserMiddleware,getCartMiddleware,getWishMiddleware,getPurchaseMiddleware,redirectIfAuthenticated,(req, res) => {
    const isLoggedIn = !!req.session.user;
    res.render("auth/signup.ejs", {
      isLoggedIn,
      loggedInUser: req.loggedInUser,
      page: "login",
      cartItemsCount: req.cartItemsCount,
      wishItemsCount: req.wishItemsCount,
      orderCount: req.purchaseCount,
      notificationCount: getNoticeCount(),
    });
});

router.post("/signup", redirectIfAuthenticated, upload.single("img"), async (req, res) => {
  try {
    let {
  firstname,
  lastname,
  email,
  Pass,
  phone,
  address,
  city,
  province,
  zip,
} = req.body;

firstname = firstname.trim();
lastname = lastname.trim();
email = email.trim();
address = address.trim();
city = city.trim();

const { isValid, errors } = validateSignupInput({
  firstname,
  lastname,
  email,
  Pass,
  phone,
  address,
  city,
  zip,
});

const imageUrl = req.file?.path || null;
console.log(imageUrl)


if (!isValid) {
  console.log("Validation errors:", errors);
   return res.json({error: "Check input fields for errors."});
}

    // Check if user already exists
    const checkUser = await pool
      .request()
      .input("email", email)
      .query("SELECT email FROM users WHERE email = @email");

    if (checkUser.recordset.length > 0) {
         console.log("That email is already registered. Try logging in instead.");
         return res.json({error: "⚠️ That email is already registered. Try logging in instead."});
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPass = await bcrypt.hash(Pass, salt);

    // Email verification token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hrs
     const verifyUrl = `${baseUrl}/verify-email?token=${token}`;

    // Send verification email
    try {
      await transporter.sendMail({
        from: `"Acess" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: "Please Verify Your Email 📧",
        html: `
          <h2>Hey ${firstname},</h2>
          <p>Thanks for signing up! Please verify your email by clicking the button below:</p>
          <p><a href="${verifyUrl}" style="background-color:#4CAF50;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Verify Email</a></p>
          <p>This link will expire in 24 hours.</p>
        `,
      });
      req.flash("success", "✅ Verification email sent" );
      console.log("✅ Verification email sent to:", email);
    } catch (emailError) {
      console.log("❌ Email failed to send:", emailError);
      return res.json({error: "❌ Email failed to send."});
    }

    // Only now insert into DB
    const dateJoined = new Date();

    const result = await pool
      .request()
      .input("firstname", firstname)
      .input("lastname", lastname)
      .input("email", email)
      .input("Pass", hashedPass)
      .input("phone", phone)
      .input("address", address)
      .input("city", city)
      .input("province", province)
      .input("zip", zip)
      .input("img", imageUrl)
      .input("date_joined", dateJoined)
      .query(`
        INSERT INTO users (firstname, lastname, email, Pass, phone, address, city, province, zip, img, date_joined)
        OUTPUT INSERTED.id
        VALUES (@firstname, @lastname, @email, @Pass, @phone, @address, @city, @province, @zip, @img, @date_joined)
      `);

    const userId = result.recordset[0].id;

    // Save token for verification
    await pool
      .request()
      .input("user_id", userId)
      .input("token", token)
      .input("expires_at", expiresAt)
      .query(`
        INSERT INTO email_tokens (user_id, token, expires_at)
        VALUES (@user_id, @token, @expires_at)
      `);

    const fullName = `${firstname} ${lastname}`;
    await logEmail(userId, fullName, email, "email verification");

    // Create session + redirect
    req.session.user = { firstname, lastname, email };
    req.session.userId = userId;
    req.flash("success", "Successfully registered!");
    req.session.save(() => {
    res.json({ redirect: "/home" });
    });


  } catch (error) {
    console.error("🔥 Signup crash:", error);
    console.log("Unexpected error occurred. Try again.");
    res.status(500).json({ error: "Signup crash. Unexpected error occurred. Try again." });
  }
});

router.get("/login",getUserMiddleware,getCartMiddleware,getWishMiddleware,getPurchaseMiddleware,redirectIfAuthenticated,(req, res) => {
    const isLoggedIn = !!req.session.user;
    res.render("auth/login", {
      isLoggedIn,
      loggedInUser: req.loggedInUser,
      page: "login",
      cartItemsCount: req.cartItemsCount,
      wishItemsCount: req.wishItemsCount,
      orderCount: req.purchaseCount,
      notificationCount: getNoticeCount(),
    });
});

router.post("/login", async (req, res) => {
  try {
    const { email, Pass, firstname, lastname } = req.body;
    const user = await getUserByEmail(email);

    if (!user) {
      req.flash("error", "Invalid email or password");
      return res.redirect("/login");
    }

    const passwordMatch = await bcrypt.compare(Pass, user.Pass);
    if (!passwordMatch) {
      req.flash("error", "Invalid email or password");
      return res.redirect("/login");
    }

    if (user.firstname !== firstname || user.lastname !== lastname) {
      req.flash("error", "Invalid login credentials");
      return res.redirect("/login");
    }

    req.session.user = user;
    req.session.userId = user.id;
    req.flash("success", "Welcome Back!");
    const redirectUrl = req.session.returnTo || "/home";
    delete req.session.returnTo;
    return res.redirect(redirectUrl);

  } catch (e) {
    console.log("Error:", e);
    return res.status(500).send("Internal Server Error");
  }
});

router.get("/logout", (req, res) => {
  delete req.session.returnTo;
  req.flash("success", "Successfully Logged Out!");
  req.session.destroy(() => {
    res.redirect("/home?location=logout");
  });
});

router.get("/verify-email", async (req, res) => {
  const { token } = req.query;

  try {
    const tokenResult = await pool
      .request()
      .input("token", token)
      .query("SELECT * FROM email_tokens WHERE token = @token");

    if (tokenResult.recordset.length === 0) {
      return res.send("Invalid or expired token.");
    }

    const { user_id } = tokenResult.recordset[0];

    // Update user's verified status
    await pool
      .request()
      .input("user_id", user_id)
      .query("UPDATE users SET is_verified = 1 WHERE id = @user_id");

    // Delete the token
    await pool
      .request()
      .input("token", token)
      .query("DELETE FROM email_tokens WHERE token = @token");

    res.send("✅ Email verified! You can now log in.");
  } catch (err) {
    console.error("Verification error:", err);
    res.status(500).send("Something went wrong.");
  }
});

router.post("/resend-verification", isAuthenticated, async (req, res) => {
  const { email } = req.body;
  const fullName = req.session.user.firstname + req.session.user.lastname ;

  try {
    // 1. Check if user exists and is NOT verified
    const userResult = await pool
      .request()
      .input("email", email)
      .query("SELECT id, firstname FROM Users WHERE email = @email AND is_verified = 0");

    if (userResult.recordset.length === 0) {
      req.flash("error", "❌ Invalid or already verified email.");
      return req.session.save(() => res.redirect("/user-profile"));
    }

    const { id: userId, firstname } = userResult.recordset[0];

    // 2. Count resend attempts (userId + email combo)
    const attemptResult = await pool
      .request()
      .input("email", email)
      .input("userId", userId)
      .query(`
        SELECT COUNT(*) AS attempts
        FROM EmailResendAttempts
        WHERE userId = @userId  AND attemptAt > DATEADD(HOUR, -24, GETDATE())
      `);

    const attempts = attemptResult.recordset[0].attempts;

    if (attempts >= 3) {
      req.flash("error", "⚠️ You’ve hit the 3 resends limit in 24 hours. Try again later.");
      return req.session.save(() => res.redirect("/user-profile"));
    }

    // 3. Generate new token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const verifyUrl = `${baseUrl}/verify-email?token=${token}`;


    await pool
      .request()
      .input("user_id", userId)
      .input("token", token)
      .input("expires_at", expiresAt)
      .query(`
        INSERT INTO email_tokens (user_id, token, expires_at)
        VALUES (@user_id, @token, @expires_at)
      `);

    // 4. Send the email
    try {
      await transporter.sendMail({
        from: `"Acess" <${process.env.GMAIL_USER}>`,
        to: email,
        subject: "Please Verify Your Email 📧",
        html: `
          <h2>Hey ${firstname},</h2>
          <p>Thanks for signing up! Please verify your email by clicking the button below:</p>
          <p><a href="${verifyUrl}" style="background-color:#4CAF50;color:white;padding:10px 15px;text-decoration:none;border-radius:5px;">Verify Email</a></p>
          <p>This link will expire in 24 hours.</p>
        `,
      });
      console.log("✅ Verification email re-sent to:", email);
    } catch (emailErr) {
      console.error("❌ Email send error:", emailErr);
      req.flash("error", "❌ Failed to send email. Try again.");
      return req.session.save(() => res.redirect("/user-profile"));
    }

    // 5. Log the resend attempt using userId too
    await pool
      .request()
      .input("userId", userId)
      .input("email", email)
      .query("INSERT INTO EmailResendAttempts (userId, userEmail) VALUES (@userId, @email)");

     await logEmail(userId, fullName, email, "email verification");
      
    req.flash("success", "✅ Verification email sent successfully!");
    req.session.save(() => res.redirect("/user-profile"));
  } catch (err) {
    console.error("❌ Resend route error:", err);
    req.flash("error", "💥 Server error. Please try again.");
    req.session.save(() => res.redirect("/user-profile"));
  }
});


module.exports = router;

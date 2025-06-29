const express = require("express");
const router = express.Router();
const getUserMiddleware = require("../Middleware/getUser");
const getCartMiddleware = require("../Middleware/getCart");
const getWishMiddleware = require("../Middleware/getWishlist");
const getPurchaseMiddleware = require("../Middleware/getPurchase");
const {
  getNoticeCount,
} = require("../helper_functions/timeBasedUpdate");



router.get("/about",getUserMiddleware,getCartMiddleware,getWishMiddleware,getPurchaseMiddleware,(req, res) => {
    const isLoggedIn = req.session.user ? true : false;
    res.render("about", {
      isLoggedIn,
      loggedInUser: req.loggedInUser,
      page: "about",
      cartItemsCount: req.cartItemsCount,
      wishItemsCount: req.wishItemsCount,
      orderCount: req.purchaseCount,
      notificationCount: getNoticeCount(),
    });
  }
);

router.get("/contact",getUserMiddleware,getCartMiddleware,getWishMiddleware,getPurchaseMiddleware,(req, res) => {
    const isLoggedIn = req.session.user ? true : false;
    res.render("contact", {
      isLoggedIn,
      loggedInUser: req.loggedInUser,
      page: "contact",
      cartItemsCount: req.cartItemsCount,
      wishItemsCount: req.wishItemsCount,
      orderCount: req.purchaseCount,
      notificationCount: getNoticeCount(),
    });
  }
);


module.exports = router;
const express = require("express");
const router = express.Router();
const getUserMiddleware = require("../Middleware/getUser");
const getCartMiddleware = require("../Middleware/getCart");
const getWishMiddleware = require("../Middleware/getWishlist");
const getPurchaseMiddleware = require("../Middleware/getPurchase");
const {searchProducts} = require("../helper_functions/serach");
const {
  getNoticeCount,
} = require("../helper_functions/timeBasedUpdate");


router.get( "/search",getUserMiddleware,getCartMiddleware,getWishMiddleware,getPurchaseMiddleware, async (req, res) => {
    const isLoggedIn = req.session.user ? true : false;
    if (!req.query.search) {
      req.flash("error", "Enter a query first!");
      return res.redirect(req.headers.referer || "/");
    }
    const query = req.query.search;
    let searchResults = searchProducts(query);

    // Handle sorting
    const sort = req.query.sort || "default"; // Default sort if none provided
    if (sort === "price-low-high") {
      searchResults.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sort === "price-high-low") {
      searchResults.sort((a, b) => (b.price || 0) - (a.price || 0));
    }
    // Note: "best-rating" is ignored as per your instruction

    res.render("search", {
      query,
      searchResults,
      sort, // Pass sort option to template
      isLoggedIn,
      loggedInUser: req.loggedInUser,
      page: "accessories", // Fixed typo: "acessiories" to "accessories"
      cartItemsCount: req.cartItemsCount,
      wishItemsCount: req.wishItemsCount,
      orderCount: req.purchaseCount,
      notificationCount: getNoticeCount(),
    });
});



module.exports = router;
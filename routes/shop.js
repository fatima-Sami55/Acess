const express = require("express");
const router = express.Router();
require("dotenv").config();
const data1 = require("../seeds/product.json");
const data2 = require("../seeds/acessiories.json");
const data3 = require("../seeds/men.json");
const data4 = require("../seeds/women.json");
const getUserMiddleware = require("../Middleware/getUser");
const getCartMiddleware = require("../Middleware/getCart");
const getWishMiddleware = require("../Middleware/getWishlist");
const getPurchaseMiddleware = require("../Middleware/getPurchase");
const { pool } = require("../database/data");
const {
  getNoticeCount,
} = require("../helper_functions/timeBasedUpdate");
const {getProductRating, findProductByName} = require("../helper_functions/getRating");


router.get("/home",getUserMiddleware,getCartMiddleware,getWishMiddleware,getPurchaseMiddleware, async (req, res) => {
    const isLoggedIn = req.session.user ? true : false;
    const userId = req.session.userId;
    const data = require("../seeds/product.json");

    // Optional flash for logout
    if (req.query.location === "logout") {
      req.flash("success", "Successfully Logged Out!");
      res.locals.success = req.flash("success");
    }

    let email = null;
    let attempts = 0;
 console.log(req.cartItemsCount)
    // Only run these if the user is logged in
    if (isLoggedIn && req.loggedInUser) {
      email = req.loggedInUser.email;

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

      attempts = attemptResult.recordset[0].attempts;
    }

    //console.log(req.loggedInUser);

    res.render("home", {
      isLoggedIn,
      loggedInUser: req.loggedInUser || null,
      data,
      page: "home",
      cartItemsCount: req.cartItemsCount || 0,
      wishItemsCount: req.wishItemsCount || 0,
      orderCount: req.purchaseCount || 0,
      notificationCount: getNoticeCount(),
      isVerified: req.loggedInUser ? req.loggedInUser.is_verified : true,
      resendAttempts: attempts,
      email: email,
    });
});

router.get("/Product",getUserMiddleware,getCartMiddleware,getWishMiddleware,getPurchaseMiddleware,
  async (req, res) => {
    const isLoggedIn = !!req.session.user;
    const { name, img, desc, price } = req.query;

    const decodedName = decodeURIComponent(name || "");
    const decodedImg = decodeURIComponent(img || "");
    const decodedDesc = decodeURIComponent(desc || "");
    const decodedPrice = decodeURIComponent(price || "");

    const matchedProduct = findProductByName(decodedName);

    const viewedProduct = {
      itemId: matchedProduct?.id || null,
      itemName: decodedName,
      itemImage: decodedImg,
      itemDescription: decodedDesc,
      itemPrice: decodedPrice,
      itemCategory: matchedProduct?.categories || null,
      itemSubCategory: matchedProduct?.subcategory || null,
    };

    const selectRandomProducts = (data, count) => {
      const shuffled = [...data].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    };

    const randomData1Products = selectRandomProducts(data1, 1);
    const randomData3Products = selectRandomProducts(data3, 3);
    const randomData4Products = selectRandomProducts(data4, 3);
    const randomData2Products = {};

    for (const category in data2) {
      if (Object.hasOwnProperty.call(data2, category)) {
        const categoryItems = data2[category];
        randomData2Products[category] = selectRandomProducts(categoryItems, 1);
      }
    }

    const ratings = matchedProduct
      ? getProductRating({
          id: matchedProduct.id,
          category: matchedProduct.categories,
          subcategory: matchedProduct.subcategory || null,
        })
      : [];

    console.log(req.cartItemsCount);

    res.render("product", {
      isLoggedIn,
      loggedInUser: req.loggedInUser ?? null,
      data: viewedProduct,
      ratings,
      randomData1Products,
      randomData2Products,
      randomData3Products,
      randomData4Products,
      page: "Product",
      cartItemsCount: req.cartItemsCount || 0,
      wishItemsCount: req.wishItemsCount || 0,
      orderCount: req.purchaseCount || 0,
      notificationCount: getNoticeCount(),
    });
});

router.get("/acessiories", getUserMiddleware, getCartMiddleware, getWishMiddleware, getPurchaseMiddleware, (req, res) => {
  const isLoggedIn = req.session.user ? true : false;
  const data = require("../seeds/acessiories.json");
  res.render("acessiories", {
    loggedInUser: req.loggedInUser,
    isLoggedIn,
    data,
    page: "acessiories",
    cartItemsCount: req.cartItemsCount,
    wishItemsCount: req.wishItemsCount,
    orderCount: req.purchaseCount,
    notificationCount: getNoticeCount(),
  });
});

router.get("/shop-products", async (req, res) => {
  const category = req.query.category;

  let data = [];

  if (category === "men") {
    data = require("../seeds/men.json");
  } else if (category === "women") {
    data = require("../seeds/women.json");
  } else if (category === "kids") {
    data = require("../seeds/kids.json");
  }

  res.render("../partials/shop_products", { data });
});

router.get("/shop", getUserMiddleware, getCartMiddleware, getWishMiddleware, getPurchaseMiddleware, async(req, res) => {
  const data1 = require("../seeds/men.json");
  const data2 = require("../seeds/women.json");
  const data3 = require("../seeds/kids.json");
  res.render("shop", { page: "shop", data1, data2, data3 });
});




module.exports = router;

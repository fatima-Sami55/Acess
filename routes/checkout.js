const express = require("express");
const router = express.Router();
const { pool } = require("../database/data");
const sql = require("mssql");
const getUserMiddleware = require("../Middleware/getUser");
const getCartMiddleware = require("../Middleware/getCart");
const isAuthenticated = require("../Middleware/is_logged_in");
const checkEmailVerified = require("../Middleware/getEmailVerification");
const logEmail = require("../helper_functions/emailLogger");
const sendEmail = require("../helper_functions/emailWriter");
const {html1} = require("../helper_functions/emailMessages");


router.get("/checkout", isAuthenticated, getUserMiddleware, getCartMiddleware,checkEmailVerified, (req, res) => {
  res.render("checkout", {
    loggedInUser: req.loggedInUser,
    cartItemsCount: req.cartItemsCount,
  });
});

router.post("/checkout", isAuthenticated,checkEmailVerified, async (req, res) => {
  const userId = req.session.userId;
  const {
    TotalPrice,
    OrderStatus,
    ShippingAddress,
    Quantity,
    PurchaseDate,
  } = req.body;

  try {
    const result = await pool.request()
      .input("TotalPrice", sql.Decimal(10, 2), TotalPrice)
      .input("OrderStatus", sql.VarChar, OrderStatus)
      .input("ShippingAddress", sql.VarChar, ShippingAddress)
      .input("Quantity", sql.Int, Quantity)
      .input("PurchaseDate", sql.DateTime, new Date(PurchaseDate))
      .input("UserId", sql.Int, userId)
      .query(`
        INSERT INTO purchaseditems (TotalPrice, OrderStatus, ShippingAddress, Quantity, PurchaseDate, UserId)
        OUTPUT INSERTED.PurchaseID
        VALUES (@TotalPrice, @OrderStatus, @ShippingAddress, @Quantity, @PurchaseDate, @UserId)
      `);

    if (result.recordset.length > 0) {
      const orderId = result.recordset[0].PurchaseID;
      req.session.OrderId = orderId;
      req.flash("success", "Checkout step 1 completed successfully!");
      return res.status(200).json({ success: true, message: "Checkout completed successfully!" });
    } else {
      req.flash("error", "Checkout failed. Please try again!");
      return res.status(500).json({ success: false, message: "Checkout failed. Please try again." });
    }
  } catch (err) {
    console.error("SQL Error:", err);
    return res.status(500).json({ success: false, message: "An error occurred during checkout." });
  }
});

router.get("/safe-checkout", isAuthenticated,checkEmailVerified, async (req, res, next) => {
  res.render("safe-checkout");
});

router.post("/safe-checkout", isAuthenticated, getCartMiddleware,checkEmailVerified, async (req, res) => {
  const userId = req.session.userId;
  const fullName = req.session.user.firstname + " " +  req.session.user.lastname;
  const email =  req.session.user.email;
  const {
    cardType,
    quantities,
    TotalPrice,
    OrderStatus,
    ShippingAddress,
    Quantity,
    PurchaseDate,
    shipping,
    Discount,
  } = req.body;

  if (!cardType) {
    req.flash("error", "No card type selected");
    return res.redirect("/safe-checkout");
  }

  const parsedQuantities = JSON.parse(quantities);

  try {
    // Insert into purchaseditems
    const result = await pool.request()
      .input("TotalPrice", sql.Decimal(10, 2), TotalPrice)
      .input("OrderStatus", sql.VarChar, OrderStatus)
      .input("ShippingAddress", sql.VarChar, ShippingAddress)
      .input("Quantity", sql.Int, Quantity)
      .input("PurchaseDate", sql.DateTime, new Date(PurchaseDate))
      .input("UserId", sql.Int, userId)
      .input("PaymentMethod", sql.VarChar, cardType)
      .input("shipping_fee", sql.Decimal(10, 2), shipping)
      .input("Discount", sql.Decimal(10, 2), Discount)
      .query(`
        INSERT INTO purchaseditems (TotalPrice, OrderStatus, ShippingAddress, Quantity, PurchaseDate, UserId, PaymentMethod, shipping_fee, Discount)
        OUTPUT INSERTED.PurchaseID
        VALUES (@TotalPrice, @OrderStatus, @ShippingAddress, @Quantity, @PurchaseDate, @UserId, @PaymentMethod, @shipping_fee, @Discount)
      `);

    const purchaseId = result.recordset[0].PurchaseID;

    // Prepare insert values for `orders` table
 for (let i = 0; i < req.cartItems.length; i++) {
  const item = req.cartItems[i];
  const parsedQty = parseInt(parsedQuantities[i], 10);

  await pool.request()
    .input("itemName", sql.VarChar, item.item_Name)
    .input("itemImg", sql.VarChar, item.item_img)
    .input("itemDesc", sql.VarChar, item.item_description)
    .input("itemPrice", sql.Decimal(10, 2), item.item_price)
    .input("userId", sql.Int, userId)
    .input("quantity", sql.Int, parsedQty)
    .input("purchaseId", sql.Int, purchaseId)
    .query(`
      INSERT INTO orders (itemName, item_img, itemDescription, item_price, user_id, quantity, purchase_id)
      VALUES (@itemName, @itemImg, @itemDesc, @itemPrice, @userId, @quantity, @purchaseId)
    `);
}

    // Delete cart items
    await pool.request()
      .input("user_id", sql.Int, userId)
      .query("DELETE FROM cart_items WHERE user_id = @user_id");

    const subject = "Order Confirmation - Acess"; 
    await sendEmail({ to: email, subject, html: html1 });
    await logEmail(userId, fullName, email, "order_placed");

    req.flash("success", "Order is placed. Thanks!");
    return res.status(200).json({ success: true, message: "Payment information updated successfully!" });

  } catch (err) {
    console.error("SQL Error:", err);
    return res.status(500).json({ success: false, message: "An error occurred during checkout." });
  }
});

module.exports = router;
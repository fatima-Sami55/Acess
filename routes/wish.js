const express = require("express");
const router = express.Router();
const { pool } = require("../database/data");
const sql = require("mssql");
const isAuthenticated = require("../Middleware/is_logged_in");
const checkEmailVerified = require("../Middleware/getEmailVerification");



router.get("/wish", isAuthenticated,checkEmailVerified, async (req, res) => {
  const userId = req.session.userId;
  try {
    const result = await pool.request().input("user_id", userId).query("SELECT * FROM wish_items WHERE user_id = @user_id");
    res.render("wish.ejs", { data: result.recordset, page: "wish" });
  } catch (err) {
    console.error("Error fetching wishlist items:", err);
    res.status(500).send("Internal Server Error");
  }
});

router.post("/wish", isAuthenticated,checkEmailVerified, async (req, res) => {
  const { itemName, itemImage, itemDescription, itemPrice } = req.body;
  const userId = req.session.userId;
  const currentDate = new Date();

  try {
    const check = await pool
      .request()
      .input("user_id", userId)
      .input("item_name", itemName)
      .query("SELECT * FROM wish_items WHERE user_id = @user_id AND item_Name = @item_name");

    if (check.recordset.length > 0) {
      req.flash("error", "Item already in the wishlist");
      return res.redirect("/wish");
    }

    await pool
      .request()
      .input("user_id", userId)
      .input("item_name", itemName)
      .input("item_image", itemImage)
      .input("item_description", itemDescription)
      .input("item_price", itemPrice)
      .input("item_date",sql.DateTime, currentDate)
      .query("INSERT INTO wish_items (user_id, item_Name, item_image, item_description, item_price, item_date) VALUES (@user_id, @item_name, @item_image, @item_description, @item_price, @item_date)");

    req.flash("success", "Item added to wishlist successfully");
    return res.redirect("/wish");
  } catch (err) {
    console.error("Error adding item to wishlist:", err);
    res.status(500).send("Internal Server Error");
  }
});

router.post("/delete/wishItem/:id", isAuthenticated,checkEmailVerified, async (req, res) => {
  const itemId = parseInt(req.params.id);
  const userId = req.session.userId;
  try {
    const result = await pool
      .request()
      .input("id", itemId)
      .input("user_id", userId)
      .query("DELETE FROM wish_items WHERE id = @id AND user_id = @user_id");

    if (result.rowsAffected[0] > 0) {
      req.flash("success", "Item deleted successfully");
    } else {
      req.flash("error", "Item not found or permission denied");
    }
    return res.redirect("/wish");
  } catch (err) {
    console.error("Error deleting wishlist item:", err);
    req.flash("error", "Server error");
    return res.redirect("/wish");
  }
});


module.exports = router;
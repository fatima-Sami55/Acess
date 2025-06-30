const express = require("express");
const router = express.Router();
const { pool } = require("../database/data");
const sql = require("mssql");
const fs = require("fs");
const path = require("path");
const dataPath = path.join(__dirname, "../order_history/purchase.json");
const data = require(dataPath);
const getUserMiddleware = require("../Middleware/getUser");
const getPurchaseMiddleware = require("../Middleware/getPurchase");
const getOrderMiddleware = require("../Middleware/getOrders");
const isAuthenticated = require("../Middleware/is_logged_in");
const checkEmailVerified = require("../Middleware/getEmailVerification");
const logEmail = require("../helper_functions/emailLogger");
const sendEmail = require("../helper_functions/emailWriter");
const {html2, html3, html4} = require("../helper_functions/emailMessages");
const {
  getNoticeCount,
  getCurrentNotifications,
} = require("../helper_functions/timeBasedUpdate");

router.get("/orders", isAuthenticated, getPurchaseMiddleware,checkEmailVerified, (req, res) => {
  res.render("orders", {
    purchase: req.purchase,
    purchaseCount: req.purchaseCount,
    page: "orders",
  });
});

router.get("/track-order", isAuthenticated, getOrderMiddleware, getPurchaseMiddleware, checkEmailVerified, async (req, res) => {
  const currentDate = new Date();
  const id = req.query.purchase_id;

  if (!id || !data[id]) {
    console.error("Order ID not found in JSON file.");
    return res.status(404).send("Order ID not found.");
  }

  const orderData = data[id];
  const previousStatus = orderData.OrderStatus || "Placed";

  const userId = req.session.userId;
  const fullName = req.session.user.firstname + " " + req.session.user.lastname;
  const email = req.session.user.email;

  // Define status priority
  const statusPriority = {
    "Placed": 0,
    "arrived": 1,
    "shipped": 2,
    "delivered": 3,
    "reviewed": 4, // if you ever set this later
  };

  const currentPriority = statusPriority[previousStatus];
  let newStatus = previousStatus;

  try {
    if (currentDate >= new Date(orderData.delivery) && currentPriority < statusPriority["delivered"]) {
      newStatus = "delivered";
      await sendEmail({ to: email, subject: "Order Delivery - Acess", html: html4 });
      await logEmail(userId, fullName, email, "order delivery");
    } else if (currentDate >= new Date(orderData.shipment) && currentPriority < statusPriority["shipped"]) {
      newStatus = "shipped";
      await sendEmail({ to: email, subject: "Order Shipment - Acess", html: html3 });
      await logEmail(userId, fullName, email, "order shipment");
    } else if (currentDate >= new Date(orderData.arrival) && currentPriority < statusPriority["arrived"]) {
      newStatus = "arrived";
      await sendEmail({ to: email, subject: "Order Arrival - Acess", html: html2 });
      await logEmail(userId, fullName, email, "order arrival at warehouse");
    }

    // Write new status to DB
    if (newStatus !== previousStatus) {
      orderData.OrderStatus = newStatus;

      // Update DB
      await pool.request()
        .input("OrderStatus", sql.VarChar, newStatus)
        .input("PurchaseID", sql.Int, id)
        .query(`
          UPDATE purchasedItems 
          SET OrderStatus = CASE 
                              WHEN OrderStatus != 'reviewed' THEN @OrderStatus 
                              ELSE OrderStatus 
                            END 
          WHERE PurchaseID = @PurchaseID
        `);

      // Save updated JSON file
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf8");
    }

    res.render("track-order", {
      orders: req.orders,
      purchase: req.purchase,
      verified_id: id,
      data,
      currentDate,
    });

  } catch (err) {
    console.error("Order Tracking Error:", err);
    res.status(500).send("Error updating order status.");
  }
});

router.post("/cancel-order", isAuthenticated,checkEmailVerified, async (req, res) => {
  const { PurchaseID } = req.body;
  const userID = req.session.userId;
  const data = require("../p.json");

  if (!PurchaseID || !data[PurchaseID]) {
    return res.json({ success: false, message: "Order ID not found." });
  }

  const orderData = data[PurchaseID];

  // Check if order already shipped
  if (new Date() >= new Date(orderData.shipment)) {
    return res.json({
      success: false,
      message: "Cannot cancel order. It has already shipped.",
    });
  }

  try {
    // Delete from purchaseditems
    const deletePurchaseResult = await pool.request()
      .input("PurchaseID", sql.Int, PurchaseID)
      .input("UserID", sql.Int, userID)
      .query("DELETE FROM purchaseditems WHERE PurchaseID = @PurchaseID AND UserID = @UserID");

    if (deletePurchaseResult.rowsAffected[0] > 0) {
      delete data[PurchaseID];

      // Delete from orders table
      const deleteOrdersResult = await pool.request()
        .input("PurchaseID", sql.Int, PurchaseID)
        .input("UserID", sql.Int, userID)
        .query("DELETE FROM orders WHERE purchase_id = @PurchaseID AND user_id = @UserID");

      req.flash("success", "Order cancelled successfully!");
      res.json({ success: true });
    } else {
      res.json({ success: false, message: "Order not found or already deleted." });
    }
  } catch (err) {
    console.error("Database error:", err);
    res.json({ success: false, message: "Database error." });
  }
});

router.get("/inbox", isAuthenticated, getUserMiddleware,checkEmailVerified, (req, res) => {
  res.render("inbox", {
    loggedInUser: req.loggedInUser,
    page: "inbox",
    notifications: getNoticeCount(),
  });
});

router.post("/delete-notification", isAuthenticated,checkEmailVerified, async (req, res) => {
  const userId = req.session.userId;
  const { id } = req.body;

  try {
    const result = await pool.request()
      .input("id", sql.Int, id)
      .input("user_id", sql.Int, userId)
      .query("DELETE FROM notifications WHERE id = @id AND user_id = @user_id");

    console.log("Notification deleted:", result.rowsAffected);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting notification:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }

  getCurrentNotifications(); 
});

router.post("/delete-all", isAuthenticated,checkEmailVerified, async (req, res) => {
  const userId = req.session.userId;

  try {
    const result = await pool.request()
      .input("user_id", sql.Int, userId)
      .query("DELETE FROM notifications WHERE user_id = @user_id");

    console.log("All notifications deleted:", result.rowsAffected);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting all notifications:", error);
    res.status(500).json({ success: false, message: "Server error." });
  }

  getCurrentNotifications(); 
});

router.get("/review", isAuthenticated,checkEmailVerified, async (req, res) => {
  const userId = req.session.userId;

  try {
     const result = await pool.request()
  .input("user_id", sql.Int, userId)
  .query(`
    SELECT 
      o.id,
      o.itemName,
      o.itemDescription,
      o.item_img,
      o.quantity,
      o.item_price,
      o.user_id,
      o.purchase_id,
      p.purchasedItemId
    FROM orders o
    JOIN purchasedItems p ON o.purchase_id = p.PurchaseID
    WHERE p.orderStatus = 'delivered' 
      AND o.user_id = @user_id
      AND o.review_status = 0
  `);

    res.render("review", {
      review: result.recordset,
      page: "Reviews",
      reviewCount: result.recordset.length,
    });
  } catch (error) {
    console.error("Error fetching delivered orders:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.post("/review", isAuthenticated, checkEmailVerified, async (req, res) => {
  const { review, rating, id, productName, purchasedItemId } = req.body;
  const userId = req.session.userId;

  try {
    // Step 1: Insert into reviews
    const insertResult = await pool.request()
      .input("rating", sql.Int, rating)
      .input("review", sql.Text, review)
      .input("user_id", sql.Int, userId)
      .input("order_id", sql.Int, id)
      .input("product_name", sql.VarChar, productName)
      .input("purchasedItemId", sql.UniqueIdentifier, purchasedItemId)
      .query(`
        INSERT INTO reviews (rating, review, user_id, order_id, product_name, PurchasedItemID)
        VALUES (@rating, @review, @user_id, @order_id, @product_name, @purchasedItemId)
      `);

    if (insertResult.rowsAffected[0] === 0) {
      return res.status(500).send("Failed to insert review");
    }

    // Step 2: Mark that specific item as reviewed
    await pool.request()
      .input("id", sql.Int, id)
      .query(`
        UPDATE orders
        SET review_status = 1
        WHERE id = @id
      `);

    // Step 3: Check if all items in the same purchase are now reviewed
    const purchaseIdResult = await pool.request()
      .input("id", sql.Int, id)
      .query(`SELECT purchase_id FROM orders WHERE id = @id`);

    const purchaseId = purchaseIdResult.recordset[0].purchase_id;

    const totalItemsResult = await pool.request()
      .input("purchase_id", sql.Int, purchaseId)
      .query(`
        SELECT COUNT(*) AS total FROM orders WHERE purchase_id = @purchase_id
      `);

    const reviewedItemsResult = await pool.request()
      .input("purchase_id", sql.Int, purchaseId)
      .query(`
        SELECT COUNT(*) AS reviewed FROM orders 
        WHERE purchase_id = @purchase_id AND review_status = 1
      `);

    const total = totalItemsResult.recordset[0].total;
    const reviewed = reviewedItemsResult.recordset[0].reviewed;

    // Step 4: If all reviewed, update the main purchase status
    if (total === reviewed) {
      await pool.request()
        .input("purchasedItemId", sql.UniqueIdentifier, purchasedItemId)
        .query(`
          UPDATE purchaseditems 
          SET OrderStatus = 'reviewed'
          WHERE PurchasedItemID = @purchasedItemId
        `);
    }

    // All done
    req.flash("success", "Review submitted successfully!");
    res.status(200).send("Review submitted successfully");

  } catch (error) {
    console.error("❌ Error in POST /review:", error);
    res.status(500).send("Internal Server Error");
  }
});

router.delete("/review", isAuthenticated, async (req, res) => {
  const { orderId, purchasedItemId } = req.body;

  try {
    // Step 1: Set review_status = 0 for this order item
    await pool.request()
      .input("orderId", sql.Int, orderId)
      .query(`
        UPDATE orders
        SET review_status = 1
        WHERE id = @orderId
      `);

    // Step 2: Delete the actual review from `reviews` table (optional but usually expected)
    await pool.request()
      .input("order_id", sql.Int, orderId)
      .query(`
        DELETE FROM reviews
        WHERE order_id = @order_id
      `);

    // Step 3: Check if ALL items in the purchase are now unreviewed
     const purchaseIdResult = await pool.request()
  .input("orderId", sql.Int, orderId)
  .query(`
    SELECT purchase_id FROM orders WHERE id = @orderId
  `);

if (!purchaseIdResult.recordset.length) {
  console.error("❌ Order not found with id:", orderId);
  return res.status(404).json({ error: "Order not found. Cannot continue." });
}

const purchaseId = purchaseIdResult.recordset[0].purchase_id;
    

    const totalItemsResult = await pool.request()
      .input("purchaseId", sql.Int, purchaseId)
      .query(`SELECT COUNT(*) AS total FROM orders WHERE purchase_id = @purchaseId`);

    const reviewedItemsResult = await pool.request()
      .input("purchaseId", sql.Int, purchaseId)
      .query(`SELECT COUNT(*) AS reviewed FROM orders WHERE purchase_id = @purchaseId AND review_status = 1`);

    const total = totalItemsResult.recordset[0].total;
    const reviewed = reviewedItemsResult.recordset[0].reviewed;

    // Step 4: If NO items are reviewed, revert purchase status back to 'delivered' or 'not reviewed'
    if (reviewed === 0) {
      await pool.request()
        .input("purchasedItemId", sql.UniqueIdentifier, purchasedItemId)
        .query(`
          UPDATE purchasedItems
          SET OrderStatus = 'delivered'
          WHERE PurchasedItemID = @purchasedItemId
        `);
    }

    req.flash("success", "Review removed successfully!");
    res.status(200).json({ message: "Review removed successfully" });

  } catch (err) {
    console.error("❌ Delete review error:", err);
    req.flash("error", "Delete Review Error!");
    res.status(500).json({ error: "Failed to delete review" });
  }
});

router.get("/email", isAuthenticated, async(req, res) => {
      try {
    const result = await pool
      .request()
      .input("user_id", userId)
      .query(`
        SELECT * FROM EmailLogs
        WHERE user_id = @user_id
        ORDER BY sentAt DESC
      `);
    
    res.render("email", {
      page: "email",
      logs: result.recordset
    });
  } catch (err) {
    console.error("❌ Failed to load email logs:", err);
    res.render("email", { page: "email", logs: [], totalMails: 0 });
  }
});



module.exports = router;
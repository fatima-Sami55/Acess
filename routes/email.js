const express = require("express");
const router = express.Router();
const { pool } = require("../database/data");
const sql = require("mssql");
const isAuthenticated = require("../Middleware/is_logged_in");


router.delete("/email-log/:id", isAuthenticated, async (req, res) => {
  const { id } = req.params;

  try {
    await pool
      .request()
      .input("id", sql.Int, id)
      .query("DELETE FROM EmailLogs WHERE id = @id");

    req.flash("success", "✅ Email notification deleted.");
    res.redirect("/email"); // Go back to email logs
  } catch (err) {
    console.error("❌ Delete failed:", err);
    req.flash("error", "❌ Could not delete the Email notification.");
    res.redirect("/email");
  }
});



module.exports = router;
const cron = require("node-cron");
const sql = require("mssql");
const { pool, poolConnect } = require("../database/data");
const { getRandomNotifications } = require("../helper_functions/notifications_helper");

let notice = 0;

// ⏰ Schedule every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  try {
    await poolConnect; // 🧠 ensure DB is connected
    const newNotifications = getRandomNotifications(1);
    await insertNotifications(newNotifications);
    await getCurrentNotifications();
  } catch (err) {
    console.error("Error in scheduled task:", err);
  }
});

// ✅ Insert new notification (avoid duplicates)
async function insertNotifications(notifications) {
  try {
    await poolConnect;
    for (const notification of notifications) {
      const sessionResult = await pool.request().query(`
        SELECT TOP 1 
          JSON_VALUE(CAST(session AS NVARCHAR(MAX)), '$.userId') AS userId
        FROM sessions
        ORDER BY JSON_VALUE(CAST(session AS NVARCHAR(MAX)), '$.cookie.expires') DESC
      `);

      const userId = parseInt(sessionResult.recordset[0]?.userId);
      if (!userId) {
        console.warn("⚠️ No user ID found to assign notification.");
        continue;
      }

      await pool.request()
        .input("user_id", sql.Int, userId)
        .input("message", sql.NVarChar(500), notification.message)
        .query(`
          INSERT INTO notifications (user_id, message)
          SELECT @user_id, @message
          WHERE NOT EXISTS (
            SELECT 1 FROM notifications WHERE message = @message AND user_id = @user_id
          )
        `);
    }

    console.log("✅ Notifications inserted successfully.");
  } catch (err) {
    console.error("❌ Error inserting notifications:", err);
  }
}

async function getCurrentNotifications() {
  try {
    await poolConnect;

    const sessionResult = await pool.request().query(`
      SELECT TOP 1 
        JSON_VALUE(CAST(session AS NVARCHAR(MAX)), '$.userId') AS userId
      FROM sessions
      ORDER BY JSON_VALUE(CAST(session AS NVARCHAR(MAX)), '$.cookie.expires') DESC
    `);

    const userId = parseInt(sessionResult.recordset[0]?.userId);
    if (!userId) {
      console.warn("⚠️ No valid session/userId found.");
      return;
    }

    const notifResult = await pool
      .request()
      .input("userId", sql.Int, userId)
      .query("SELECT * FROM notifications WHERE user_id = @userId");

    notice = notifResult.recordset.length;

    if (global.io) {
      global.io.emit("notifications", notifResult.recordset);
    }

    console.log(`📥 Fetched userId: ${userId}`);
    console.log(`🔔 Notifications sent. Count: ${notice}`);
  } catch (err) {
    console.error("❌ Error fetching notifications:", err);
  }
}

function getNoticeCount() {
  return notice;
}

module.exports = {
  getNoticeCount,
  getCurrentNotifications,
};

const { pool } = require("../database/data"); // ✅ import the SQL Server pool

async function getUserMiddleware(req, res, next) {
  const userId = req.session.userId;

  if (!userId) {
    console.log("User not logged in");
    return next(); // still go forward without crashing
  }

  try {
    const result = await pool.request().query("SELECT * FROM users");

    const loggedInUser = result.recordset.find((user) => user.id === userId);

    if (!loggedInUser) {
      console.log("User not found");
    }

    req.loggedInUser = loggedInUser;
    next();
  } catch (err) {
    console.error("Database error in getUserMiddleware:", err);
    next(err); // pass error to Express error handler
  }
}

module.exports = getUserMiddleware;

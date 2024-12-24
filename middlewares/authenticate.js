const jwt = require("jsonwebtoken");
const { pool } = require("../Database/config");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// Middleware to authenticate requests using JWT token from cookies
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET); // Verify the token

    const client = await pool.connect();

    // Verify userId from the token exists in the database
    const userCheck = await client.query(
      "SELECT * FROM users WHERE user_id = $1",
      [decoded.userId]
    );

    if (userCheck.rows.length === 0) {
      client.release();
      return res.status(401).json({ error: "Unauthorized: Invalid user ID" });
    }

    req.user = decoded; // Attach decoded user information to the request object
    client.release();
    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    console.error("JWT verification or user validation error:", err.message);
    res.status(401).json({ error: "Unauthorized: Invalid token or user" });
  }
};

module.exports = authenticate;

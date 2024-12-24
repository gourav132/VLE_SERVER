const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../Database/config");

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
const tokenAge = 3 * 24 * 60 * 60;

// Helper function to generate a 6-digit unique user ID
const generateUserId = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Route for registering a new user
router.post("/register", async (req, res) => {
  const { fname, lname, email, password } = req.body;

  try {
    const client = await pool.connect();

    // Check if the user already exists
    const userCheck = await client.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    if (userCheck.rows.length > 0) {
      client.release();
      return res.status(400).json({ error: "User already exists" });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate a unique user ID
    const userId = generateUserId();

    // Insert the new user into the users table
    await client.query(
      `INSERT INTO users (user_id, fname, lname, email, password) VALUES ($1, $2, $3, $4, $5)`,
      [userId, fname, lname, email, hashedPassword]
    );

    // Generate a JWT token
    const token = jwt.sign({ userId: userId, email: email }, JWT_SECRET, {
      expiresIn: tokenAge,
    });

    client.release();
    res.cookie("jwt", token, {
      withCredential: true,
      httpOnly: false,
      sameSite: "Lax",
      maxAge: tokenAge * 1000,
    });
    res
      .status(201)
      .json({ message: "User registered successfully", status: true });
  } catch (err) {
    console.error("Error registering user:", err.message);
    res.status(500).json({ error: "Failed to register user" });
  }
});

// Route for logging in a user
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const client = await pool.connect();

    // Check if the user exists
    const userResult = await client.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    if (userResult.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Compare the provided password with the stored hashed password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      client.release();
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate a JWT token
    const token = jwt.sign(
      { userId: user.user_id, email: user.email },
      JWT_SECRET,
      {
        expiresIn: tokenAge,
      }
    );

    client.release();
    res
      .status(200)
      .json({ fname: user.fname, lname: user.lname, token: token });
  } catch (err) {
    console.error("Error logging in user:", err.message);
    res.status(500).json({ error: "Failed to log in" });
  }
});

module.exports = router;

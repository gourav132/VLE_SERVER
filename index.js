require("dotenv").config();
const { pool } = require("./Database/config");
const express = require("express");
const cors = require("cors");

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const app = express();
app.use(express.json());
app.use(cors({
  origin: ["http://localhost:3000", "https://expense-tracker-fawn-ten.vercel.app"],
  method: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(cookieParser());

const PORT = process.env.PORT || 4242;
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
const tokenAge = 3 * 24 * 60 * 60;

// Middleware to authenticate requests using JWT token from cookies
const authenticate = async (req, res, next) => {
  // const token = req.cookies.jwt; // Extract JWT token from the "jwt" cookie
  // console.log("request -> ", req.cookies);
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  // console.warn("authenticate header",authHeader);

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET); // Verify the token

    const client = await pool.connect();

    // Verify userId from the token exists in the database
    const userCheck = await client.query("SELECT * FROM users WHERE user_id = $1", [decoded.userId]);

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


// Helper function to generate a 6-digit unique user ID
const generateUserId = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Route for registering a new user
app.post("/register", async (req, res) => {
  const { fname, lname, email, password } = req.body;

  try {
    const client = await pool.connect();

    // Check if the user already exists
    const userCheck = await client.query("SELECT * FROM users WHERE email = $1", [email]);
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
    res.status(201).json({ message: "User registered successfully", user: user, status: true });
  } catch (err) {
    console.error("Error registering user:", err.message);
    res.status(500).json({ error: "Failed to register user" });
  }
});

// Route for logging in a user
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const client = await pool.connect();

    // Check if the user exists
    const userResult = await client.query("SELECT * FROM users WHERE email = $1", [email]);
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
    const token = jwt.sign({ userId: user.user_id, email: user.email }, JWT_SECRET, {
      expiresIn: tokenAge,
    });

    client.release();
    res.cookie("jwt", token, {
      withCredential: true,
      httpOnly: false,
      sameSite: "Lax",
      maxAge: tokenAge * 1000,
    });
    res.status(200).json({user: user, status: true});
    // res.json({ message: "Login successful", token });
  } catch (err) {
    console.error("Error logging in user:", err.message);
    res.status(500).json({ error: "Failed to log in" });
  }
});

app.get("/", authenticate, async (req, res) => {

  const userId = req.user.userId;
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT * FROM expenses WHERE user_id = $1 ORDER BY date DESC", [userId]);
    client.release();
    const data = result.rows;
    res.json(data);
  } catch (err) {
    console.error(err);
  }
});

app.post("/recordExpense", authenticate, async (req, res) => {
  const userId = req.user.userId;
  const { date, description, category, amount } = req.body;
  try {
    const client = await pool.connect();
    await client.query(
      `INSERT INTO expenses (user_id, date, description, category, amount) VALUES ($1, $2, $3, $4, $5)`,
      [userId, date, description, category, amount]
    );
    client.release();
    res.json({
      status: "Entry added successfully",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add entry" });
  }
});

app.get("/categoryExpense", authenticate, async (req, res) => {
  const userId = req.user.userId;
  try {
    const client = await pool.connect();

    // Get the current month and year
    const currentMonth = new Date().getMonth() + 1; // getMonth() returns 0-11, so add 1
    const currentYear = new Date().getFullYear();

    // Query to fetch the total amount for each category in the current month and year
    const result = await client.query(
      `SELECT category, SUM(amount::numeric) as total_amount
       FROM expenses
       WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2 AND user_id = $3
       GROUP BY category`,
      [currentMonth, currentYear, userId]
    );

    client.release();

    // Send the response with the category and its total amount
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch category expenses" });
  }
});

app.put("/editRecord/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const { date, description, category, amount } = req.body;

  try {
    const client = await pool.connect();
    const result = await client.query(
      `UPDATE expenses
       SET date = $1, description = $2, category = $3, amount = $4
       WHERE id = $5`,
      [date, description, category, amount, id]
    );
    client.release();

    if (result.rowCount > 0) {
      res.json({ status: "Entry updated successfully" });
    } else {
      res.status(404).json({ error: "Entry not found" });
    }
  } catch (err) {
    console.error("Error updating expense:", err.message);
    res.status(500).json({ error: "Failed to update entry" });
  }
});

app.delete("/deleteRecord/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;
  try {
    const client = await pool.connect();
    const result = await client.query(
      `DELETE FROM expenses
        WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    client.release();

    if (result.rowCount > 0) {
      res.json({ status: "Entry deleted successfully" });
    } else {
      res.status(404).json({ error: "Entry not found" });
    }
  } catch (err) {
    console.log(err);
    console.error("Error deleting expense:", err.message);
    res.status(500).json({ error: "Failed to delete entry" });
  }
});

app.get("/retrieve", authenticate, async (req, res) => {
  const { category, startDate, endDate } = req.query;
  const userId = req.user.userId;

  try {
    const client = await pool.connect();

    let query = `SELECT * FROM expenses WHERE user_id = $1`;
    let conditions = [];
    let values = [userId];

    // Check if category filter is provided
    if (category) {
      conditions.push(`category = $${values.length + 1}`);
      values.push(category);
    }

    // Check if startDate and endDate are provided
    if (startDate) {
      conditions.push(`date >= $${values.length + 1}`);
      values.push(startDate);
    }

    if (endDate) {
      conditions.push(`date <= $${values.length + 1}`);
      values.push(endDate);
    }

    // Add WHERE clause if any conditions exist
    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(" AND ");
    }

    const result = await client.query(query, values);
    client.release();

    // Send the response with the expenses
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});


app.listen(PORT, () => {
  console.log(`Listening to http://localhost:${PORT}`);
});

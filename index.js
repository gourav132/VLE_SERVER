require("dotenv").config();
const { pool } = require("./Database/config");
const express = require("express");
const cors = require("cors");

const authenticate = require("./middlewares/authenticate");
const authRoutes = require("./routes/authRoutes");

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://expense-tracker-fawn-ten.vercel.app",
    ],
    method: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

const PORT = process.env.PORT || 4242;

app.use("/auth", authRoutes);

app.get("/", authenticate, async (req, res) => {
  const userId = req.user.userId;
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT * FROM expenses WHERE user_id = $1 ORDER BY date DESC",
      [userId]
    );
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

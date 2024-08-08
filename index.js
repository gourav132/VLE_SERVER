require("dotenv").config();
const { pool } = require("./Database/config");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 4242;

app.get("/", async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query("SELECT * FROM expenses");
    client.release();
    const data = result.rows;
    res.json(data);
  } catch (err) {
    console.error(err);
  }
});

app.post("/recordExpense", async (req, res) => {
  const { date, description, category, amount } = req.body;
  try {
    const client = await pool.connect();
    await client.query(
      `INSERT INTO expenses (date, description, category, amount) VALUES ($1, $2, $3, $4)`,
      [date, description, category, amount]
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

app.get("/categoryExpense", async (req, res) => {
  try {
    const client = await pool.connect();

    // Get the current month and year
    const currentMonth = new Date().getMonth() + 1; // getMonth() returns 0-11, so add 1
    const currentYear = new Date().getFullYear();

    // Query to fetch the total amount for each category in the current month and year
    const result = await client.query(
      `SELECT category, SUM(amount::numeric) as total_amount
       FROM expenses
       WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2
       GROUP BY category`,
      [currentMonth, currentYear]
    );

    client.release();

    // Send the response with the category and its total amount
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch category expenses" });
  }
});

app.get("/expensesByCategory", async (req, res) => {
  const { category } = req.query;

  try {
    const client = await pool.connect();

    // Query to fetch all expenses for the given category
    const result = await client.query(
      `SELECT * FROM expenses WHERE category = $1`,
      [category]
    );

    client.release();

    // Send the response with the expenses
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch expenses by category" });
  }
});

app.listen(PORT, () => {
  console.log(`Listening to http://localhost:${PORT}`);
});

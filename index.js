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

app.listen(PORT, () => {
  console.log(`Listening to http://localhost:${PORT}`);
});

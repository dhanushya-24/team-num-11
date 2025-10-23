// donors_app.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3001; // different port than hospital app

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// create / open donors.db in the project root
const DB_PATH = path.join(__dirname, "donors.db");
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Error opening donors.db:", err.message);
    process.exit(1);
  } else {
    console.log("Connected to donors.db (or created it)");
  }
});

// create donors table if not exists
db.run(
  `CREATE TABLE IF NOT EXISTS donors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dob TEXT,
    gender TEXT,
    bloodType TEXT,
    contact TEXT,
    email TEXT UNIQUE NOT NULL,
    address TEXT,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) console.error("Error creating donors table:", err.message);
    else console.log("donors table ready");
  }
);

// ---------- Endpoints ----------

// Register
app.post("/api/register", async (req, res) => {
  try {
    const { name, dob, gender, bloodType, contact, email, address, password } =
      req.body;
    if (!name || !email || !password)
      return res
        .status(400)
        .json({ error: "Name, email and password are required" });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const stmt = `INSERT INTO donors (name, dob, gender, bloodType, contact, email, address, password_hash)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(
      stmt,
      [name, dob, gender, bloodType, contact, email, address, hash],
      function (err) {
        if (err) {
          if (err.message && err.message.includes("UNIQUE")) {
            return res.status(409).json({ error: "Email already registered" });
          }
          return res.status(500).json({ error: "Database error" });
        }
        res.json({ id: this.lastID, message: "Registration successful" });
      }
    );
  } catch (e) {
    res.status(500).json({ error: "Server error" });
  }
});

// Login
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Missing email or password" });

  db.get("SELECT * FROM donors WHERE email = ?", [email], async (err, row) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!row) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, row.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    res.json({ id: row.id, name: row.name, email: row.email });
  });
});

// Get profile by id
app.get("/api/donors/:id", (req, res) => {
  const id = req.params.id;
  db.get(
    "SELECT id, name, dob, gender, bloodType, contact, email, address, created_at FROM donors WHERE id = ?",
    [id],
    (err, row) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(row);
    }
  );
});

app.listen(PORT, () => {
  console.log(`Donors API listening on http://localhost:${PORT}`);
});

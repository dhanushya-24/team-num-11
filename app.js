// app.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");

const app = express();
const DB_PATH = path.join(__dirname, "hospital.db");

app.use(cors());
app.use(express.json()); // parse JSON bodies

// Open (or create) database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) return console.error("DB open error:", err.message);
  console.log("Connected to SQLite DB at", DB_PATH);
});

// Create table if not exists
db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS hospitals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      contactPerson TEXT,
      contactNumber TEXT,
      email TEXT UNIQUE,
      password TEXT,
      latitude REAL,
      longitude REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    (err) => {
      if (err) console.error("Table create error:", err.message);
      else console.log("hospitals table ready");
    }
  );
});

// ---- Routes ----

// Health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// Register
app.post("/api/register", (req, res) => {
  const {
    name,
    address,
    contactPerson,
    contactNumber,
    email,
    password,
    location,
  } = req.body;

  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ error: "name, email and password are required" });
  }

  const lat = location && location.latitude ? location.latitude : null;
  const lon = location && location.longitude ? location.longitude : null;

  const stmt = `INSERT INTO hospitals
    (name, address, contactPerson, contactNumber, email, password, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  db.run(
    stmt,
    [name, address, contactPerson, contactNumber, email, password, lat, lon],
    function (err) {
      if (err) {
        if (err.message.includes("UNIQUE constraint failed")) {
          return res.status(409).json({ error: "Email already registered" });
        }
        console.error("Insert error:", err);
        return res.status(500).json({ error: "Database error" });
      }
      // this.lastID contains the inserted id
      res.json({
        message: "Registered successfully",
        id: this.lastID,
      });
    }
  );
});

// Login
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "email and password required" });

  db.get(
    "SELECT id, name, address, contactPerson, contactNumber, email, latitude, longitude FROM hospitals WHERE email=? AND password=?",
    [email, password],
    (err, row) => {
      if (err) {
        console.error("Login query error:", err);
        return res.status(500).json({ error: "Database error" });
      }
      if (!row) return res.status(401).json({ error: "Invalid credentials" });

      // return hospital summary (no password)
      res.json({ hospital: row });
    }
  );
});

// Get hospital by id
app.get("/api/hospital/:id", (req, res) => {
  const id = req.params.id;
  db.get(
    "SELECT id, name, address, contactPerson, contactNumber, email, latitude, longitude, created_at FROM hospitals WHERE id=?",
    [id],
    (err, row) => {
      if (err) {
        console.error("Get hospital error:", err);
        return res.status(500).json({ error: "Database error" });
      }
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json({ hospital: row });
    }
  );
});

// Simple list all hospitals (for admin/testing)
app.get("/api/hospitals", (req, res) => {
  db.all(
    "SELECT id, name, email, contactPerson, contactNumber, created_at FROM hospitals ORDER BY created_at DESC",
    [],
    (err, rows) => {
      if (err) {
        console.error("List error:", err);
        return res.status(500).json({ error: "Database error" });
      }
      res.json({ hospitals: rows });
    }
  );
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

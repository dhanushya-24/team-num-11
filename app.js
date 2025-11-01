const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");
const nodemailer = require("nodemailer");
require("dotenv").config(); // ✅ load .env

const app = express();
const DB_PATH = path.join(__dirname, "hospital.db");

app.use(cors());
app.use(express.json());

// Database setup
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) return console.error("DB open error:", err.message);
  console.log("Connected to SQLite DB at", DB_PATH);
});

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

// ✅ Setup Brevo SMTP Transport (only key moved to env)
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: "bloodbanklocator247@gmail.com", // ✅ keep same email
    pass: process.env.BREVO_KEY, // ✅ API key from .env
  },
});

// ---- Routes ----
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ✅ Register hospital and send email
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

  const lat = location?.latitude || null;
  const lon = location?.longitude || null;

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

      const hospitalId = this.lastID;

      // ✅ Send registration email (email unchanged)
      const mailOptions = {
        from: '"Life Link" <bloodbanklocator247@gmail.com>',
        to: email,
        subject: "Hospital Registration Successful - Life Link",
        html: `
          <p>Dear ${name},</p>
          <p>Your hospital has been successfully registered in the <b>Life Link Blood Bank System</b>.</p>
          <p><b>Hospital ID:</b> ${hospitalId}</p>
          <p><b>Contact Person:</b> ${contactPerson}</p>
          <br/>
          <p>Thank you for joining our network.</p>
          <p>— <b>Life Link Team</b></p>
        `,
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error("Email send error:", error);
        } else {
          console.log("✅ Registration email sent:", info.response);
        }
      });

      res.json({ message: "Hospital registered successfully", hospitalId });
    }
  );
});

// ✅ Login route
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

      res.json({ hospital: row });
    }
  );
});

// ✅ Get hospital by ID
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

// ✅ List all hospitals
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

// ✅ Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

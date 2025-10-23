// requests_server.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");
const open = require("open").default; // ✅ use .default for latest versions

const app = express();
const PORT = 4000; // separate port so hospital app (3000) is untouched
const DB_FILE = path.join(__dirname, "requests.db");

// Enable CORS and parse JSON
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve static HTML files

// Open / create requests.db automatically
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error("Error opening requests.db:", err);
    process.exit(1);
  }
  console.log("Connected to requests.db");
});

// Create requests table if it doesn't exist
db.run(
  `CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hospitalName TEXT,
    contactPerson TEXT,
    contactDetails TEXT,
    patientInfo TEXT,
    bloodType TEXT,
    quantity INTEGER,
    urgency TEXT,
    dateTime TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) console.error("Failed to create requests table:", err);
    else console.log("requests table ready");
  }
);

// API to save a request
app.post("/api/requests", (req, res) => {
  const {
    hospitalName,
    contactPerson,
    contactDetails,
    patientInfo,
    bloodType,
    quantity,
    urgency,
    dateTime,
    notes,
  } = req.body;

  const sql = `
    INSERT INTO requests
    (hospitalName, contactPerson, contactDetails, patientInfo, bloodType, quantity, urgency, dateTime, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    sql,
    [
      hospitalName || null,
      contactPerson || null,
      contactDetails || null,
      patientInfo || null,
      bloodType || null,
      quantity ? Number(quantity) : null,
      urgency || null,
      dateTime || null,
      notes || null,
    ],
    function (err) {
      if (err) {
        console.error("DB insert error:", err);
        return res.status(500).json({ error: "Failed to save request" });
      }
      res.json({ success: true, id: this.lastID });
    }
  );
});

// API to fetch request by ID
app.get("/api/requests/:id", (req, res) => {
  const id = Number(req.params.id);
  db.get("SELECT * FROM requests WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });
});

// Optional: fetch latest request
app.get("/api/requests/latest", (req, res) => {
  db.get("SELECT * FROM requests ORDER BY id DESC LIMIT 1", (err, row) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!row) return res.status(404).json({ error: "No requests yet" });
    res.json(row);
  });
});

// Start server and auto-open browser
app.listen(PORT, () => {
  console.log(`Requests server running at http://localhost:${PORT}`);

  // Open default browser automatically
  open(`http://localhost:${PORT}/request.html`).catch((err) => {
    console.error("Failed to open browser:", err);
  });
});

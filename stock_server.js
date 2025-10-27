const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 5002; // keeps the port you saw earlier

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Use separate DB for stock data
const db = new sqlite3.Database("stock.db", (err) => {
  if (err) {
    console.error("Error opening stock.db:", err.message);
    process.exit(1);
  }
  console.log("Connected to stock.db");

  // Create hospitals table (store hospital meta inside stock.db)
  db.run(
    `CREATE TABLE IF NOT EXISTS hospitals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE,
      address TEXT,
      contact TEXT,
      email TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`
  );

  // Create blood_stock table
  db.run(
    `CREATE TABLE IF NOT EXISTS blood_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER,
      blood_group TEXT,
      units_needed INTEGER,
      units_available INTEGER,
      FOREIGN KEY (hospital_id) REFERENCES hospitals(id)
    )`
  );
});

// POST save hospital and its blood stock (overwrites previous stock for same hospital name)
app.post("/saveStock", (req, res) => {
  const { hospitalInfo, bloodGroups } = req.body;
  if (!hospitalInfo || !hospitalInfo.name || !Array.isArray(bloodGroups)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const { name, address = "", contact = "", email = "" } = hospitalInfo;
  // Upsert hospital: insert or update (by name)
  const upsertHospitalSql = `
    INSERT INTO hospitals (name, address, contact, email, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET
      address=excluded.address,
      contact=excluded.contact,
      email=excluded.email,
      updated_at=CURRENT_TIMESTAMP
  `;

  db.run(upsertHospitalSql, [name, address, contact, email], function (err) {
    if (err) {
      console.error("Error upserting hospital:", err.message);
      return res.status(500).json({ error: "DB error while saving hospital" });
    }

    // get the hospital id (select)
    db.get(`SELECT id FROM hospitals WHERE name = ?`, [name], (err, row) => {
      if (err || !row) {
        console.error("Error retrieving hospital id:", err && err.message);
        return res
          .status(500)
          .json({ error: "DB error retrieving hospital id" });
      }

      const hospitalId = row.id;

      // Delete previous stock rows for this hospital id
      db.run(
        `DELETE FROM blood_stock WHERE hospital_id = ?`,
        [hospitalId],
        (err) => {
          if (err) {
            console.error("Error deleting old stock rows:", err.message);
            return res
              .status(500)
              .json({ error: "DB error clearing old stock" });
          }

          // Insert new stock rows
          const insertStock = db.prepare(
            `INSERT INTO blood_stock (hospital_id, blood_group, units_needed, units_available) VALUES (?, ?, ?, ?)`
          );

          for (const bg of bloodGroups) {
            const group = String(bg.group || "").trim();
            const needed = parseInt(bg.needed, 10) || 0;
            const available = parseInt(bg.available, 10) || 0;
            insertStock.run(hospitalId, group, needed, available);
          }

          insertStock.finalize((err) => {
            if (err) {
              console.error("Error finalizing stock insert:", err.message);
              return res
                .status(500)
                .json({ error: "DB error inserting stock" });
            }
            return res.json({ success: true, hospitalId });
          });
        }
      );
    });
  });
});

// GET hospital + stock by hospital name
app.get("/getStock/:hospitalName", (req, res) => {
  const hospitalName = req.params.hospitalName;
  db.get(
    `SELECT * FROM hospitals WHERE name = ?`,
    [hospitalName],
    (err, hospital) => {
      if (err) {
        console.error("Error fetching hospital:", err.message);
        return res.status(500).json({ error: "DB error fetching hospital" });
      }
      if (!hospital) {
        return res.json({ hospital: null, bloodGroups: [] });
      }

      db.all(
        `SELECT blood_group, units_needed, units_available FROM blood_stock WHERE hospital_id = ?`,
        [hospital.id],
        (err, rows) => {
          if (err) {
            console.error("Error fetching blood stock:", err.message);
            return res
              .status(500)
              .json({ error: "DB error fetching blood stock" });
          }
          res.json({ hospital, bloodGroups: rows });
        }
      );
    }
  );
});

// optional: get list of hospitals (useful later)
app.get("/hospitals", (req, res) => {
  db.all(
    `SELECT id, name, address, contact, email, updated_at FROM hospitals ORDER BY updated_at DESC`,
    [],
    (err, rows) => {
      if (err)
        return res.status(500).json({ error: "DB error fetching hospitals" });
      res.json({ hospitals: rows });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Stock server running at http://localhost:${PORT}`);
});

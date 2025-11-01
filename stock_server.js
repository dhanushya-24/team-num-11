require("dotenv").config(); // ✅ to read .env variables
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const nodemailer = require("nodemailer"); // ✅ for sending emails

const app = express();
const PORT = 5002;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// ✅ Setup Brevo SMTP Transport using env key
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: "bloodbanklocator247@gmail.com",
    pass: process.env.BREVO_API_KEY, // ✅ pulled from .env
  },
});

// ✅ SQLite Database setup
const db = new sqlite3.Database("stock.db", (err) => {
  if (err) {
    console.error("Error opening stock.db:", err.message);
    process.exit(1);
  }
  console.log("Connected to stock.db");

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

// ✅ POST: Save hospital + stock + send email
app.post("/saveStock", (req, res) => {
  const { hospitalInfo, bloodGroups } = req.body;
  if (!hospitalInfo || !hospitalInfo.name || !Array.isArray(bloodGroups)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  const { name, address = "", contact = "", email = "" } = hospitalInfo;

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

    db.get(`SELECT id FROM hospitals WHERE name = ?`, [name], (err, row) => {
      if (err || !row) {
        console.error("Error retrieving hospital id:", err && err.message);
        return res
          .status(500)
          .json({ error: "DB error retrieving hospital id" });
      }

      const hospitalId = row.id;

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

          const insertStock = db.prepare(
            `INSERT INTO blood_stock (hospital_id, blood_group, units_needed, units_available)
           VALUES (?, ?, ?, ?)`
          );

          for (const bg of bloodGroups) {
            const group = String(bg.group || "").trim();
            const needed = parseInt(bg.needed, 10) || 0;
            const available = parseInt(bg.available, 10) || 0;
            insertStock.run(hospitalId, group, needed, available);
          }

          insertStock.finalize(async (err) => {
            if (err) {
              console.error("Error finalizing stock insert:", err.message);
              return res
                .status(500)
                .json({ error: "DB error inserting stock" });
            }

            // ✅ Send stock update confirmation email
            if (email) {
              const mailOptions = {
                from: '"Life Link" <bloodbanklocator247@gmail.com>',
                to: email,
                subject: "Stock Update Confirmation - Life Link",
                html: `
                <p>Dear ${name},</p>
                <p>Your blood stock has been successfully updated in the <b>Life Link Blood Bank System</b>.</p>
                <p><b>Hospital:</b> ${name}</p>
                <p><b>Contact:</b> ${contact || "N/A"}</p>
                <p><b>Updated On:</b> ${new Date().toLocaleString()}</p>
                <br/>
                <p>Thank you for keeping your blood stock information up-to-date.</p>
                <p>— <b>Life Link Team</b></p>
              `,
              };

              try {
                await transporter.sendMail(mailOptions);
                console.log(`✅ Stock update email sent to ${email}`);
              } catch (emailErr) {
                console.error("Email send error:", emailErr);
              }
            }

            res.json({ success: true, hospitalId });
          });
        }
      );
    });
  });
});

// ✅ GET hospital + stock
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
      if (!hospital) return res.json({ hospital: null, bloodGroups: [] });

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

// ✅ Optional: List hospitals
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

// ✅ Start server
app.listen(PORT, () => {
  console.log(`Stock server running at http://localhost:${PORT}`);
});

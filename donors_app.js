// donors_app.js
require("dotenv").config(); // ✅ Load environment variables first

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const cron = require("node-cron");

// ✅ Brevo Email SDK
const SibApiV3Sdk = require("sib-api-v3-sdk");

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ✅ Secure Brevo API Setup
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY; // loaded securely from .env
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// ✅ Function to send email
async function sendEmail(toEmail, subject, htmlContent) {
  try {
    await apiInstance.sendTransacEmail({
      sender: { email: "bloodbanklocator247@gmail.com", name: "Life Link" }, // must be verified sender
      to: [{ email: toEmail }],
      subject,
      htmlContent,
    });
    console.log("✅ Email sent successfully to:", toEmail);
  } catch (error) {
    console.error("❌ Error sending email:", error);
  }
}

// ✅ Connect / create donors.db
const DB_PATH = path.join(__dirname, "donors.db");
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Error opening donors.db:", err.message);
    process.exit(1);
  } else {
    console.log("Connected to donors.db");
    initializeDonorsTable();
  }
});

function ensureColumnExistsDonors(column, type, cb) {
  db.all(`PRAGMA table_info(donors)`, (err, rows) => {
    if (err) {
      console.error("PRAGMA error", err);
      return cb && cb(err);
    }
    const exists = rows.some((r) => r.name === column);
    if (!exists) {
      db.run(`ALTER TABLE donors ADD COLUMN ${column} ${type}`, (e) => {
        if (e) console.error(`Error adding column ${column}`, e);
        else console.log(`Added column ${column} to donors`);
        cb && cb(e);
      });
    } else cb && cb(null);
  });
}

function initializeDonorsTable() {
  // Create donors table if not exists (matches the frontend fields)
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
      else {
        console.log("donors table ready");
        // Ensure expiry_date column exists (used for expiry tracking)
        ensureColumnExistsDonors("expiry_date", "TEXT", (e) => {
          if (!e) console.log("expiry_date column checked/created for donors");
        });

        // Ensure donations_count exists for leaderboard increments
        ensureColumnExistsDonors(
          "donations_count",
          "INTEGER DEFAULT 0",
          (e) => {
            if (!e)
              console.log("donations_count column checked/created for donors");
          }
        );
      }
    }
  );
}

// ==================== API ROUTES ====================

// 🩸 Donor Registration
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

    const stmt = `INSERT INTO donors (name, dob, gender, bloodType, contact, email, address, password_hash, expiry_date)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, date('now', '+42 days'))`;

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

        console.log("✅ Donor registered:", email);

        // ✉️ Send registration success email
        sendEmail(
          email,
          "Registration Successful - Life Link",
          `<p>Hello ${name},</p>
           <p>Thank you for registering as a blood donor with <b>Life Link</b>.</p>
           <p>We'll remind you in 3 months when you can donate again.</p>
           <p>Stay healthy and keep saving lives ❤️</p>`
        );

        res.json({ id: this.lastID, message: "Registration successful" });
      }
    );
  } catch (e) {
    console.error("Server error during registration:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// 🩸 Donor Login
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

// 🩸 Get Donor Profile
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

// ==================== EMAIL REMINDER SYSTEM ====================

// 🕘 Every day at 9 AM check for donors eligible after 3 months
cron.schedule("0 9 * * *", () => {
  console.log("🔁 Checking donors for 3-month reminder...");

  db.all(
    `SELECT id, name, email, created_at FROM donors 
     WHERE julianday('now') - julianday(created_at) >= 90`,
    (err, donors) => {
      if (err) return console.error("DB error in reminder:", err);
      donors.forEach((donor) => {
        sendEmail(
          donor.email,
          "Blood Donation Reminder - Life Link",
          `<p>Hi ${donor.name},</p>
           <p>It’s been 3 months since your last registration/donation.</p>
           <p>You can now donate again. Visit <b>Life Link</b> to save more lives ❤️</p>`
        );

        // Reset reminder timer after sending
        db.run(`UPDATE donors SET created_at = datetime('now') WHERE id = ?`, [
          donor.id,
        ]);
      });
    }
  );
});

// ==================== START SERVER ====================
app.listen(PORT, () => {
  console.log(`🚀 Donors API running at http://localhost:${PORT}`);
});

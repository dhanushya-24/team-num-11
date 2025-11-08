const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");
require("dotenv").config(); // ✅ load .env

// ✅ Brevo Email SDK (same as donors_app.js)
const SibApiV3Sdk = require("sib-api-v3-sdk");

const app = express();
const DB_PATH = path.join(__dirname, "hospital.db");

app.use(cors());
app.use(express.json());

// ✅ Secure Brevo API Setup (same as donors_app.js)
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY; // loaded securely from .env
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// ✅ Function to send email (same as donors_app.js)
async function sendEmail(toEmail, subject, htmlContent) {
  try {
    await apiInstance.sendTransacEmail({
      sender: { email: "bloodbanklocator247@gmail.com", name: "Life Link" },
      to: [{ email: toEmail }],
      subject,
      htmlContent,
    });
    console.log("✅ Email sent successfully to:", toEmail);
    return true;
  } catch (error) {
    console.error("❌ Error sending email:", error);
    return false;
  }
}

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

// ---- Routes ----
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ✅ Register hospital and send email using Brevo API
app.post("/api/register", async (req, res) => {
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
    async function (err) {
      if (err) {
        if (err.message.includes("UNIQUE constraint failed")) {
          return res.status(409).json({ error: "Email already registered" });
        }
        console.error("Insert error:", err);
        return res.status(500).json({ error: "Database error" });
      }

      const hospitalId = this.lastID;

      // ✅ Send registration email using Brevo API
      const subject = "Hospital Registration Successful - Life Link";
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ec1313; text-align: center;">Life Link - Hospital Registration</h2>
          <div style="background: #fcf8f8; padding: 20px; border-radius: 10px; border: 1px solid #e7cfcf;">
            <h3 style="color: #1b0d0d;">Dear ${name},</h3>
            <p style="color: #1b0d0d; font-size: 16px;">
              Your hospital has been successfully registered in the <b>Life Link Blood Bank System</b>.
            </p>
            <div style="background: #f9f0f0; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <p style="margin: 5px 0;"><strong>Hospital ID:</strong> ${hospitalId}</p>
              <p style="margin: 5px 0;"><strong>Hospital Name:</strong> ${name}</p>
              <p style="margin: 5px 0;"><strong>Contact Person:</strong> ${contactPerson}</p>
              <p style="margin: 5px 0;"><strong>Contact Number:</strong> ${contactNumber}</p>
              <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
            </div>
            <p style="color: #1b0d0d; font-size: 14px;">
              You can now login to manage your blood stock and receive donation requests.
            </p>
            <p style="color: #1b0d0d; font-size: 14px;">
              Thank you for joining our network and helping save lives.
            </p>
            <p style="color: #1b0d0d; font-size: 14px;">
              Best regards,<br>
              <strong>Life Link Team</strong>
            </p>
          </div>
        </div>
      `;

      try {
        await sendEmail(email, subject, htmlContent);
        console.log("✅ Registration email sent to:", email);
      } catch (emailError) {
        console.error(
          "❌ Email sending failed, but registration was successful"
        );
        // Don't fail the registration if email fails
      }

      res.json({
        message: "Hospital registered successfully",
        hospitalId,
        emailSent: true,
      });
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

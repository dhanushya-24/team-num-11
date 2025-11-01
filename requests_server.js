// requests_server.js
require("dotenv").config(); // ✅ Load variables from .env at the very top

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");
const open = require("open").default;

// ✅ Brevo (Sendinblue) Email SDK
const SibApiV3Sdk = require("sib-api-v3-sdk");
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications["api-key"];

// ✅ Use API key securely from .env
apiKey.apiKey = process.env.BREVO_API_KEY;

const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

async function sendEmailSingle(toEmail, subject, htmlContent) {
  try {
    const sendData = {
      sender: { email: "bloodbanklocator247@gmail.com", name: "Life Link" }, // must be verified sender
      to: [{ email: toEmail }],
      subject,
      htmlContent,
    };
    await apiInstance.sendTransacEmail(sendData);
    console.log("✅ Email sent to:", toEmail);
  } catch (err) {
    console.error(
      "❌ Error sending email to",
      toEmail,
      err && err.response ? err.response.body : err
    );
  }
}

const app = express();
const PORT = 4000;

// DB files (separate DBs)
const REQUESTS_DB = path.join(__dirname, "requests.db");
const DONORS_DB = path.join(__dirname, "donors.db");
const HOSPITAL_DB = path.join(__dirname, "hospital.db");

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Open / create DBs
const requestsDb = new sqlite3.Database(REQUESTS_DB, (err) => {
  if (err) {
    console.error("Error opening requests.db:", err);
    process.exit(1);
  }
  console.log("Connected to requests.db");
});
const donorsDb = new sqlite3.Database(DONORS_DB, (err) => {
  if (err) {
    console.error("Error opening donors.db:", err);
    process.exit(1);
  }
  console.log("Connected to donors.db");
});
const hospitalDb = new sqlite3.Database(HOSPITAL_DB, (err) => {
  if (err) {
    console.error("Error opening hospital.db:", err);
    process.exit(1);
  }
  console.log("Connected to hospital.db");
});

// Create tables if not exist
requestsDb.run(
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
    if (err) console.error("requests table create error:", err);
    else console.log("requests table ready");
  }
);

donorsDb.run(
  `CREATE TABLE IF NOT EXISTS donors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    bloodType TEXT,
    city TEXT,
    lastDonationDate TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) console.error("donors table create error:", err);
    else console.log("donors table ready");
  }
);

hospitalDb.run(
  `CREATE TABLE IF NOT EXISTS hospitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    city TEXT,
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  (err) => {
    if (err) console.error("hospitals table create error:", err);
    else console.log("hospitals table ready");
  }
);

/*
  API: POST /api/requests
  - Saves the request into requests.db
  - Sends confirmation email to hospital contact (contactDetails)
  - Finds donors with the same bloodType in donors.db and sends each an email
*/
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

  const insertSql = `
    INSERT INTO requests
    (hospitalName, contactPerson, contactDetails, patientInfo, bloodType, quantity, urgency, dateTime, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  requestsDb.run(
    insertSql,
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

      const insertedId = this.lastID;
      console.log("✅ Request saved with ID:", insertedId);

      // 1) Send confirmation email to hospital
      if (contactDetails) {
        const subject = "Blood Request Confirmation - Life Link";
        const html = `<p>Hello ${contactPerson || "Hospital"},</p>
          <p>Your request for <b>${bloodType || "blood"}</b> (${
          quantity || "N/A"
        } units) has been received (Request ID: ${insertedId}).</p>
          <p>Urgency: <b>${urgency || "N/A"}</b></p>
          <p>We will notify matching donors nearby.</p>
          <br/><p>Thank you,<br/><b>Life Link Team</b></p>`;
        sendEmailSingle(contactDetails, subject, html);
      }

      // 2) Notify matching donors
      if (bloodType) {
        donorsDb.all(
          `SELECT name, email, phone, city FROM donors WHERE bloodType = ?`,
          [bloodType],
          (err, donors) => {
            if (err) {
              console.error("Error querying donors:", err);
            } else if (!donors || donors.length === 0) {
              console.log("No donors found for blood type:", bloodType);
            } else {
              console.log(
                `Found ${donors.length} donor(s) for ${bloodType}. Sending emails...`
              );
              donors.forEach((donor) => {
                if (!donor.email) return;
                const subject = `Urgent: ${bloodType} Blood Needed at ${
                  hospitalName || "nearby hospital"
                }`;
                const html = `<p>Dear ${donor.name || "Donor"},</p>
                  <p>There is an urgent need for <b>${bloodType}</b> blood at <b>${
                  hospitalName || "a hospital"
                }</b>.</p>
                  <p>Contact: <b>${contactDetails || "not provided"}</b></p>
                  <p>If you are available to donate, please contact the hospital immediately.</p>
                  <br/><p>Thank you for saving lives.<br/><b>Life Link Team</b></p>`;
                sendEmailSingle(donor.email, subject, html);
              });
            }
          }
        );
      }

      res.json({ success: true, id: insertedId });
    }
  );
});

// Optional helper routes
app.get("/api/requests/:id", (req, res) => {
  const id = Number(req.params.id);
  requestsDb.get("SELECT * FROM requests WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: "DB error" });
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  });
});

app.get("/api/requests/latest", (req, res) => {
  requestsDb.get(
    "SELECT * FROM requests ORDER BY id DESC LIMIT 1",
    (err, row) => {
      if (err) return res.status(500).json({ error: "DB error" });
      if (!row) return res.status(404).json({ error: "No requests yet" });
      res.json(row);
    }
  );
});

app.listen(PORT, () => {
  console.log(`🚀 Requests server running at http://localhost:${PORT}`);
  open(`http://localhost:${PORT}/request.html`).catch((err) => {
    console.error("Failed to open browser:", err);
  });
});

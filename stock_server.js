// stock_server.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");
require("dotenv").config();
const fetch = require("node-fetch"); // npm install node-fetch@2

// ✅ Brevo Email SDK (same as donors_app.js)
const SibApiV3Sdk = require("sib-api-v3-sdk");

const app = express();
const PORT = 5002;

app.use(cors());
app.use(express.json());

// Startup debug
console.log("Node version:", process.version);
console.log("BREVO key length:", (process.env.BREVO_API_KEY || "").length);

// ✅ Secure Brevo API Setup (same as donors_app.js)
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications["api-key"];
apiKey.apiKey = process.env.BREVO_API_KEY || ""; // loaded securely from .env
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Robust sendEmail: try SDK with retries, fallback to fetch
async function sendEmailSdkOnce(toEmail, subject, htmlContent) {
  return apiInstance.sendTransacEmail({
    sender: { email: "bloodbanklocator247@gmail.com", name: "Life Link" },
    to: [{ email: toEmail }],
    subject,
    htmlContent,
  });
}

async function sendEmailFetch(toEmail, subject, htmlContent) {
  try {
    const body = {
      sender: { name: "Life Link", email: "bloodbanklocator247@gmail.com" },
      to: [{ email: toEmail }],
      subject,
      htmlContent,
    };

    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY || "",
      },
      body: JSON.stringify(body),
      timeout: 15000,
    });

    const json = await res.json();
    return json;
  } catch (err) {
    throw err;
  }
}

async function sendEmail(toEmail, subject, htmlContent) {
  // Try SDK with retries
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`Sending email via Sib SDK attempt ${attempt} to ${toEmail}`);
      const resp = await sendEmailSdkOnce(toEmail, subject, htmlContent);
      console.log("✅ Email sent successfully (SDK) to:", toEmail);
      return { method: "sdk", response: resp };
    } catch (err) {
      console.error(
        `❌ SDK send attempt ${attempt} failed:`,
        err && err.message ? err.message : err
      );
      // If last attempt, try fetch fallback
      if (attempt === maxAttempts) {
        console.log("Attempting fetch fallback to Brevo API...");
        try {
          const fetchResp = await sendEmailFetch(toEmail, subject, htmlContent);
          console.log("✅ Email sent successfully (fetch) to:", toEmail);
          return { method: "fetch", response: fetchResp };
        } catch (fetErr) {
          console.error(
            "❌ Fetch fallback also failed:",
            fetErr && fetErr.message ? fetErr.message : fetErr
          );
          return { error: fetErr };
        }
      } else {
        // small backoff
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
}

// Initialize database - will create automatically
const dbPath = path.join(__dirname, "stock.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log("Connected to SQLite stock database.");
    initializeDatabase();
  }
});

function ensureColumnExists(table, column, type, callback) {
  db.all(`PRAGMA table_info(${table})`, (err, rows) => {
    if (err) {
      console.error("PRAGMA error", err);
      return callback && callback(err);
    }
    const exists = rows.some((r) => r.name === column);
    if (!exists) {
      const sql = `ALTER TABLE ${table} ADD COLUMN ${column} ${type}`;
      db.run(sql, (e) => {
        if (e) console.error(`Error adding column ${column} to ${table}`, e);
        else console.log(`Added column ${column} to ${table}`);
        return callback && callback(e);
      });
    } else {
      return callback && callback(null);
    }
  });
}

function initializeDatabase() {
  // Create hospitals table with ALL fields
  const createHospitalsTable = `
    CREATE TABLE IF NOT EXISTS hospitals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      address TEXT NOT NULL,
      contact TEXT NOT NULL,
      email TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  // Create blood_stock table
  const createBloodStockTable = `
    CREATE TABLE IF NOT EXISTS blood_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER NOT NULL,
      blood_group TEXT NOT NULL,
      units_needed INTEGER DEFAULT 0,
      units_available INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (hospital_id) REFERENCES hospitals (id) ON DELETE CASCADE,
      UNIQUE(hospital_id, blood_group)
    )
  `;

  db.serialize(() => {
    db.run(createHospitalsTable, (err) => {
      if (err) {
        console.error("Error creating hospitals table:", err);
      } else {
        console.log("Hospitals table created/verified");
      }
    });

    db.run(createBloodStockTable, (err) => {
      if (err) {
        console.error("Error creating blood_stock table:", err);
      } else {
        console.log("Blood stock table created/verified");
        // Ensure expiry_date column exists (TEXT)
        ensureColumnExists("blood_stock", "expiry_date", "TEXT", (e) => {
          if (!e) console.log("expiry_date checked/created on blood_stock");
        });
      }
    });
  });
}

// Function to send stock update email
async function sendStockUpdateEmail(hospitalEmail, hospitalName) {
  const subject = "Blood Stock Updated Successfully - Life Link";
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #ec1313; text-align: center;">Life Link - Blood Stock Management</h2>
      <div style="background: #fcf8f8; padding: 20px; border-radius: 10px; border: 1px solid #e7cfcf;">
        <h3 style="color: #1b0d0d;">Dear ${hospitalName},</h3>
        <p style="color: #1b0d0d; font-size: 16px;">
          Your blood stock information has been successfully updated in our system.
        </p>
        <p style="color: #1b0d0d; font-size: 16px;">
          The updated information is now available for donors and patients to view on our platform.
        </p>
        <div style="text-align: center; margin: 20px 0;">
          <div style="background: #ec1313; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block;">
            Stock Updated Successfully ✓
          </div>
        </div>
        <p style="color: #1b0d0d; font-size: 14px;">
          Thank you for keeping your blood stock information current and helping save lives.
        </p>
        <p style="color: #1b0d0d; font-size: 14px;">
          Best regards,<br>
          <strong>Life Link Team</strong>
        </p>
      </div>
    </div>
  `;

  return await sendEmail(hospitalEmail, subject, htmlContent);
}

// Save hospital and blood stock data
app.post("/saveStock", async (req, res) => {
  const { hospitalInfo, bloodGroups } = req.body;

  console.log("Received hospital data:", hospitalInfo);
  console.log("Received blood groups:", bloodGroups);

  if (!hospitalInfo || !bloodGroups) {
    return res
      .status(400)
      .json({ success: false, error: "Missing required data" });
  }

  // Validate required fields
  if (
    !hospitalInfo.name ||
    !hospitalInfo.address ||
    !hospitalInfo.contact ||
    !hospitalInfo.email
  ) {
    return res
      .status(400)
      .json({ success: false, error: "All hospital fields are required" });
  }

  db.serialize(() => {
    // Insert or update hospital information
    const insertHospital = `
      INSERT OR REPLACE INTO hospitals (name, address, contact, email)
      VALUES (?, ?, ?, ?)
    `;

    console.log("Saving hospital:", hospitalInfo);

    db.run(
      insertHospital,
      [
        hospitalInfo.name,
        hospitalInfo.address,
        hospitalInfo.contact,
        hospitalInfo.email,
      ],
      function (err) {
        if (err) {
          console.error("Error saving hospital:", err);
          return res.status(500).json({ success: false, error: err.message });
        }

        // After INSERT OR REPLACE, retrieve hospital id.
        // Note: this.lastID may be 0 when REPLACE occurs; so select by name.
        db.get(
          `SELECT id FROM hospitals WHERE name = ?`,
          [hospitalInfo.name],
          (err2, row) => {
            if (err2 || !row) {
              console.error("Error fetching hospital id:", err2);
              return res
                .status(500)
                .json({ success: false, error: "Cannot fetch hospital id" });
            }

            const hospitalId = row.id;
            console.log("Hospital saved with ID:", hospitalId);

            // First, delete existing blood stock for this hospital
            const deleteExisting = `DELETE FROM blood_stock WHERE hospital_id = ?`;

            db.run(deleteExisting, [hospitalId], (err) => {
              if (err) {
                console.error("Error deleting existing blood stock:", err);
                return res
                  .status(500)
                  .json({ success: false, error: err.message });
              }

              // Insert new blood stock records
              // We include expiry_date; set it to 42 days from now by default
              const insertBloodStock = `
            INSERT INTO blood_stock (hospital_id, blood_group, units_needed, units_available, expiry_date)
            VALUES (?, ?, ?, ?, date('now', '+42 days'))
          `;

              const stmt = db.prepare(insertBloodStock);
              let completed = 0;
              const total = bloodGroups.length;

              if (total === 0) {
                // If no blood groups, just return success
                stmt.finalize(async (err) => {
                  if (err) {
                    console.error(
                      "Error finalizing blood stock insertion:",
                      err
                    );
                    return res
                      .status(500)
                      .json({ success: false, error: err.message });
                  }

                  console.log(
                    "Data saved successfully for hospital:",
                    hospitalInfo.name
                  );

                  // Send email notification using Brevo API
                  const emailSent = await sendStockUpdateEmail(
                    hospitalInfo.email,
                    hospitalInfo.name
                  );

                  res.json({
                    success: true,
                    hospitalId: hospitalId,
                    emailSent: emailSent,
                  });
                });
                return;
              }

              bloodGroups.forEach((bg) => {
                stmt.run(
                  [
                    hospitalId,
                    bg.group,
                    parseInt(bg.needed) || 0,
                    parseInt(bg.available) || 0,
                  ],
                  (err) => {
                    if (err) {
                      console.error("Error saving blood stock:", err);
                    }
                    completed++;

                    if (completed === total) {
                      stmt.finalize(async (err) => {
                        if (err) {
                          console.error(
                            "Error finalizing blood stock insertion:",
                            err
                          );
                          return res
                            .status(500)
                            .json({ success: false, error: err.message });
                        }

                        console.log(
                          "Data saved successfully for hospital:",
                          hospitalInfo.name
                        );

                        // Send email notification using Brevo API
                        const emailSent = await sendStockUpdateEmail(
                          hospitalInfo.email,
                          hospitalInfo.name
                        );

                        res.json({
                          success: true,
                          hospitalId: hospitalId,
                          emailSent: emailSent,
                        });
                      });
                    }
                  }
                );
              });
            });
          }
        );
      }
    );
  });
});

// Get hospital and blood stock data
app.get("/getStock/:hospitalName", (req, res) => {
  const hospitalName = req.params.hospitalName;

  const query = `
    SELECT 
      h.id as hospital_id,
      h.name,
      h.address,
      h.contact,
      h.email,
      bs.blood_group,
      bs.units_needed,
      bs.units_available,
      bs.expiry_date
    FROM hospitals h
    LEFT JOIN blood_stock bs ON h.id = bs.hospital_id
    WHERE h.name = ?
    ORDER BY bs.blood_group
  `;

  db.all(query, [hospitalName], (err, rows) => {
    if (err) {
      console.error("Error fetching data:", err);
      return res.status(500).json({ success: false, error: err.message });
    }

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Hospital not found" });
    }

    // Structure the response
    const hospital = {
      id: rows[0].hospital_id,
      name: rows[0].name,
      address: rows[0].address,
      contact: rows[0].contact,
      email: rows[0].email,
    };

    const bloodGroups = rows
      .filter((row) => row.blood_group)
      .map((row) => ({
        blood_group: row.blood_group,
        units_needed: row.units_needed,
        units_available: row.units_available,
        expiry_date: row.expiry_date,
      }));

    res.json({
      success: true,
      hospital: hospital,
      bloodGroups: bloodGroups,
    });
  });
});

// Get all hospitals with their data (for debugging)
app.get("/hospitals", (req, res) => {
  const query = "SELECT * FROM hospitals ORDER BY name";

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Error fetching hospitals:", err);
      return res.status(500).json({ success: false, error: err.message });
    }

    console.log("All hospitals in database:", rows);
    res.json({ success: true, hospitals: rows });
  });
});

// Get all blood stock (for debugging)
app.get("/bloodstock", (req, res) => {
  const query = `
    SELECT bs.*, h.name as hospital_name, h.address, h.contact, h.email
    FROM blood_stock bs 
    JOIN hospitals h ON bs.hospital_id = h.id
    ORDER BY h.name, bs.blood_group
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Error fetching blood stock:", err);
      return res.status(500).json({ success: false, error: err.message });
    }

    res.json({ success: true, bloodStock: rows });
  });
});

// ⭐ NEW: Expiry endpoint for dashboard
app.get("/expiry", (req, res) => {
  const query = `
    SELECT bs.id, bs.blood_group, bs.units_available, bs.expiry_date, h.name as hospital_name, h.email
    FROM blood_stock bs
    JOIN hospitals h ON h.id = bs.hospital_id
    ORDER BY bs.expiry_date ASC
  `;
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error("Error fetching expiry data:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
    res.json(rows || []);
  });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Stock server is running",
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`Stock server running on http://localhost:${PORT}`);
  console.log("Endpoints:");
  console.log(`  POST /saveStock - Save hospital and blood stock data`);
  console.log(`  GET  /getStock/:hospitalName - Get hospital data`);
  console.log(`  GET  /hospitals - List all hospitals (debug)`);
  console.log(`  GET  /bloodstock - List all blood stock (debug)`);
  console.log(`  GET  /expiry - Return expiry information for dashboard`);
  console.log(`  GET  /health - Health check`);
  console.log(`✅ Brevo Email API configured with your existing API key`);
});

// commitments_server.js (fixed)
require("dotenv").config();
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");
const SibApiV3Sdk = require("sib-api-v3-sdk");
const fetch = require("node-fetch"); // npm install node-fetch@2

const app = express();
app.use(cors());
app.use(express.json());

// serve static pages from ./public
app.use(express.static(path.join(__dirname, "public")));

/* Brevo setup (reuse same API key) */
const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey =
  process.env.BREVO_API_KEY || "";
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

async function sendEmail(toEmail, subject, htmlContent) {
  try {
    await apiInstance.sendTransacEmail({
      sender: { email: "bloodbanklocator247@gmail.com", name: "Life Link" },
      to: [{ email: toEmail }],
      subject,
      htmlContent,
    });
    return { ok: true };
  } catch (err) {
    // fallback to fetch if SDK fails
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": process.env.BREVO_API_KEY || "",
        },
        body: JSON.stringify({
          sender: { email: "bloodbanklocator247@gmail.com", name: "Life Link" },
          to: [{ email: toEmail }],
          subject,
          htmlContent,
        }),
        timeout: 15000,
      });
      const j = await res.json();
      return { ok: true, resp: j };
    } catch (e) {
      console.error(
        "Email error (both SDK and fetch):",
        e && e.message ? e.message : e
      );
      return { ok: false, err: e };
    }
  }
}

/* Local commitments DB */
const DB_FILE = path.join(__dirname, "commitments.db");
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error("commitments db open err", err);
    process.exit(1);
  }
  console.log("Commitments DB opened:", DB_FILE);
  init();
});

/* Also open donors.db so we can read/update donor counts */
const donorsDb = new sqlite3.Database(path.join(__dirname, "donors.db"));

/* helper: ensure donors table has a column safely */
function ensureDonorColumn(column, cb) {
  donorsDb.all(`PRAGMA table_info(donors)`, (err, rows) => {
    if (err) {
      console.error("Error checking donors table columns", err);
      return cb && cb(err);
    }
    const exists = rows && rows.some((r) => r.name === column);
    if (exists) return cb && cb(null);
    // add column (may error in some sqlite builds if column exists concurrently — ignore)
    donorsDb.run(
      `ALTER TABLE donors ADD COLUMN ${column} INTEGER DEFAULT 0`,
      (e) => {
        if (e) {
          // log but continue
          console.warn(
            `Could not add column ${column} (it may already exist):`,
            e.message || e
          );
          return cb && cb(null);
        }
        console.log(`Added column ${column} to donors`);
        cb && cb(null);
      }
    );
  });
}

function init() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS commitments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER,
      donor_id INTEGER,
      token TEXT UNIQUE,
      status TEXT DEFAULT 'Pending',
      responded_at DATETIME,
      confirmed_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hospital_id INTEGER,
      donor_id INTEGER,
      rating INTEGER,
      review TEXT,
      consent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  });
}

/* Endpoint: createCommitments
   Body: { requestId, matches: [{ donor_id, email, name }, ...], requestSummary }
*/
app.post("/createCommitments", async (req, res) => {
  const { requestId, matches, requestSummary } = req.body;
  if (!requestId || !Array.isArray(matches))
    return res.status(400).json({ error: "missing data" });

  const stmt = db.prepare(
    `INSERT INTO commitments (request_id, donor_id, token) VALUES (?, ?, ?)`
  );
  const results = [];
  for (const d of matches) {
    const token = uuidv4();
    stmt.run([requestId, d.donor_id, token], async function (err) {
      if (err) {
        console.error("commit insert err", err);
        results.push({ donor_id: d.donor_id, ok: false });
      } else {
        const link = `${req.protocol}://${req.get(
          "host"
        )}/respond.html?token=${token}`;
        const subject = `Urgent: ${
          requestSummary?.blood_type || "Blood"
        } needed nearby`;
        const html = `<p>Hi ${d.name || "Donor"},</p>
                      <p>${
                        requestSummary?.requester_name || "Someone"
                      } needs <b>${requestSummary?.blood_type || ""}</b> in ${
          requestSummary?.city || ""
        }.</p>
                      <p>Please respond: <a href="${link}">Accept or Decline</a></p>`;
        const emailResp = await sendEmail(d.email, subject, html);
        results.push({
          donor_id: d.donor_id,
          token,
          emailSent: !!emailResp.ok,
        });
      }
    });
  }
  stmt.finalize(() =>
    res.json({
      success: true,
      message: "commitments created (emails fired async)",
      results,
    })
  );
});

/* GET respond by token */
app.get("/respond/:token", (req, res) => {
  const token = req.params.token;
  db.get(
    `SELECT * FROM commitments WHERE token = ?`,
    [token],
    (err, commit) => {
      if (err || !commit) return res.status(404).json({ error: "Not found" });
      res.json({ commitment: commit });
    }
  );
});

/* POST respond (accept/decline) */
app.post("/respond/:token", async (req, res) => {
  const token = req.params.token;
  const { action } = req.body;
  if (!["accept", "decline"].includes(action))
    return res.status(400).json({ error: "invalid action" });
  const now = new Date().toISOString();
  const newStatus = action === "accept" ? "Accepted" : "Declined";
  db.run(
    `UPDATE commitments SET status = ?, responded_at = ? WHERE token = ?`,
    [newStatus, now, token],
    function (err) {
      if (err) return res.status(500).json({ error: "DB error" });
      db.get(
        `SELECT donor_id, id FROM commitments WHERE token = ?`,
        [token],
        async (e, row) => {
          if (row) {
            donorsDb.get(
              `SELECT name,email FROM donors WHERE id = ?`,
              [row.donor_id],
              async (er, donorRow) => {
                if (donorRow && donorRow.email) {
                  const subject = `Your response recorded (${newStatus})`;
                  const html = `<p>Hi ${donorRow.name || "Donor"},</p>
                          <p>Your response has been recorded as <b>${newStatus}</b>.</p>
                          ${
                            newStatus === "Accepted"
                              ? `<p>Please confirm donation date: <a href="${
                                  req.protocol
                                }://${req.get(
                                  "host"
                                )}/confirm.html?commitment=${
                                  row.id
                                }">Confirm donation</a></p>`
                              : ""
                          }`;
                  await sendEmail(donorRow.email, subject, html);
                }
              }
            );
          }
          res.json({ success: true, status: newStatus });
        }
      );
    }
  );
});

/* POST confirm donation */
app.post("/confirm", (req, res) => {
  const { commitment_id, donation_date } = req.body;
  if (!commitment_id || !donation_date)
    return res.status(400).json({ error: "missing" });

  db.get(
    `SELECT donor_id FROM commitments WHERE id = ?`,
    [commitment_id],
    (err, commit) => {
      if (err || !commit)
        return res.status(404).json({ error: "commitment not found" });

      db.run(
        `UPDATE commitments SET status = 'Confirmed', confirmed_date = ? WHERE id = ?`,
        [donation_date, commitment_id],
        function (uErr) {
          if (uErr) return res.status(500).json({ error: "db update err" });

          // ensure donors has donations_count column, then increment
          ensureDonorColumn("donations_count", () => {
            donorsDb.run(
              `UPDATE donors SET donations_count = COALESCE(donations_count,0) + 1 WHERE id = ?`,
              [commit.donor_id],
              (upErr) => {
                if (upErr) console.error("donor count inc err", upErr);
                res.json({ success: true, message: "Donation confirmed" });
              }
            );
          });
        }
      );
    }
  );
});

/* Leaderboard endpoint */
app.get("/leaderboard", (req, res) => {
  donorsDb.all(
    `SELECT id, name, donations_count FROM donors ORDER BY donations_count DESC LIMIT 50`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ top: rows || [] });
    }
  );
});

/* Ratings endpoints */
app.post("/ratings", (req, res) => {
  const { hospital_id, donor_id, rating, review, consent } = req.body;
  if (!hospital_id || !rating)
    return res.status(400).json({ error: "missing" });
  db.run(
    `INSERT INTO ratings (hospital_id, donor_id, rating, review, consent) VALUES (?,?,?,?,?)`,
    [hospital_id, donor_id || null, rating, review || "", consent ? 1 : 0],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.get("/reviews/:hospitalId", (req, res) => {
  const id = req.params.hospitalId;
  db.all(
    `SELECT donor_id, rating, review, created_at FROM ratings WHERE hospital_id = ? AND consent = 1 ORDER BY created_at DESC`,
    [id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ reviews: rows || [] });
    }
  );
});

/* commitments-for-donor (use in profile to show pending commitments) */
app.get("/commitments-for-donor", (req, res) => {
  const donor_id = req.query.donor_id;
  if (!donor_id) return res.json([]);
  db.all(
    `SELECT * FROM commitments WHERE donor_id = ? AND status = 'Accepted'`,
    [donor_id],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    }
  );
});

const PORT = process.env.COMMIT_PORT || 4001;
app.listen(PORT, () =>
  console.log(`Commitments server running at http://localhost:${PORT}`)
);

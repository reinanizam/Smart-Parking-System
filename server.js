const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const db = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// -----------------------------
// Transaction helper (ACID safety)
// -----------------------------
async function withTransaction(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    throw e;
  } finally {
    try { conn.release(); } catch (_) {}
  }
}

// -----------------------------
// Serve frontend (fixes "Cannot GET /")
// -----------------------------
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
app.use(express.static(FRONTEND_DIR));
app.get("/", (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// -----------------------------
// Helpers
// -----------------------------
function money2(n) {
  const x = Number(n || 0);
  return Math.round(x * 100) / 100;
}

// fee rule:
// entry_fee covers first 60 minutes (even 1 second)
// after that: per-minute based on hourly_rate / 60
function calcFee(entryTime, exitTime, entryFee, hourlyRate) {
  const start = new Date(entryTime).getTime();
  const end = new Date(exitTime).getTime();
  const minutes = Math.max(0, Math.ceil((end - start) / 60000)); // ceil to bill started minute

  if (minutes <= 60) return money2(entryFee);

  const overtimeMinutes = minutes - 60;
  const perMin = Number(hourlyRate) / 60;
  return money2(Number(entryFee) + overtimeMinutes * perMin);
}

// -----------------------------
// AUTH
// -----------------------------
app.post("/auth/register", async (req, res) => {
  try {
    const { full_name, email, phone_number, password } = req.body || {};
    if (!full_name || !email || !phone_number || !password) {
      return res.json({ error: "Missing required fields" });
    }

    const [exists] = await db.query("SELECT driver_id FROM driver WHERE email = ?", [email]);
    if (exists.length) return res.json({ error: "Email already exists" });

    const hash = await bcrypt.hash(password, 10);
    const [r] = await db.query(
      "INSERT INTO driver (full_name, email, phone_number, password_hash) VALUES (?, ?, ?, ?)",
      [full_name, email, phone_number, hash]
    );

    res.json({ message: "Account created", driver_id: r.insertId });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.json({ error: "Email and password required" });

    // IMPORTANT: no must_pay anywhere
    const [rows] = await db.query(
      "SELECT driver_id, full_name, email, password_hash FROM driver WHERE email = ? LIMIT 1",
      [email]
    );

    if (!rows.length) return res.json({ error: "Invalid credentials" });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.json({ error: "Invalid credentials" });

    res.json({
      driver_id: user.driver_id,
      full_name: user.full_name,
      email: user.email
    });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// -----------------------------
// ADMIN: List all drivers (for tracking registrations)
// -----------------------------
app.get("/admin/drivers", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT driver_id, full_name, email, phone_number, created_at 
       FROM driver 
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// Get driver count
app.get("/admin/stats", async (req, res) => {
  try {
    const [[driverCount]] = await db.query("SELECT COUNT(*) as count FROM driver");
    const [[vehicleCount]] = await db.query("SELECT COUNT(*) as count FROM vehicle");
    const [[sessionCount]] = await db.query("SELECT COUNT(*) as count FROM `log`");
    const [[activeCount]] = await db.query("SELECT COUNT(*) as count FROM `log` WHERE status='ACTIVE'");
    
    res.json({
      drivers: driverCount.count,
      vehicles: vehicleCount.count,
      total_sessions: sessionCount.count,
      active_sessions: activeCount.count
    });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// -----------------------------
// VEHICLES
// -----------------------------
app.get("/vehicle/:driverId", async (req, res) => {
  try {
    const driverId = Number(req.params.driverId);
    const [rows] = await db.query(
      "SELECT plate_no, vehicle_type, model, year, color FROM vehicle WHERE driver_id = ? ORDER BY plate_no",
      [driverId]
    );
    res.json(rows);
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

app.delete("/vehicles/:plate", async (req, res) => {
  try {
    const driver_id = req.query.driver_id;
    const plate_no = req.params.plate;

    if (!driver_id || !plate_no) {
      return res.json({ error: "Missing driver or plate" });
    }

    const [r] = await db.query(
      `DELETE FROM vehicle 
       WHERE plate_no = ? AND driver_id = ?`,
      [plate_no, driver_id]
    );

    if (r.affectedRows === 0) {
      return res.json({ error: "Vehicle not found" });
    }

    res.json({ message: "Vehicle removed" });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});




app.post("/vehicle/add", async (req, res) => {
  try {
    const { driver_id, plate_no, vehicle_type, model, year, color } = req.body || {};
    if (!driver_id || !plate_no) return res.json({ error: "driver_id and plate_no required" });

    await db.query(
      "INSERT INTO vehicle (plate_no, driver_id, vehicle_type, model, year, color) VALUES (?, ?, ?, ?, ?, ?)",
      [plate_no, driver_id, vehicle_type || null, model || null, year || null, color || null]
    );

    res.json({ message: "Vehicle added" });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

app.delete("/vehicle/:plate", async (req, res) => {
  try {
    const driver_id = Number(req.query.driver_id);
    const plate_no = String(req.params.plate || "").trim();

    if (!driver_id || !plate_no) {
      return res.json({ error: "Missing driver_id or plate" });
    }

    const [r] = await db.query(
      `DELETE FROM vehicle
       WHERE plate_no = ? AND driver_id = ?`,
      [plate_no, driver_id]
    );

    if (r.affectedRows === 0) {
      return res.json({ error: "Vehicle not found" });
    }

    res.json({ message: "Vehicle removed" });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});


// -----------------------------
// CREDIT CARDS
// -----------------------------
// Get all cards for a driver
app.get("/cards/:driverId", async (req, res) => {
  try {
    const driverId = Number(req.params.driverId);
    const [rows] = await db.query(
      `SELECT card_id, card_nickname, card_number, card_expiry, card_cvv, card_type, is_default 
       FROM credit_card 
       WHERE driver_id = ? 
       ORDER BY is_default DESC, card_id DESC`,
      [driverId]
    );
    res.json(rows);
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// Add a new card
app.post("/cards/add", async (req, res) => {
  try {
    const { driver_id, card_nickname, card_number, card_expiry, card_cvv, card_type, is_default } = req.body || {};
    if (!driver_id || !card_number || !card_expiry || !card_cvv) {
      return res.json({ error: "driver_id, card_number, card_expiry, and card_cvv are required" });
    }

    const r = await withTransaction(async (conn) => {
      // If setting as default, unset other defaults first
      if (is_default) {
        await conn.query("UPDATE credit_card SET is_default = 0 WHERE driver_id = ?", [driver_id]);
      }

      const [ins] = await conn.query(
        `INSERT INTO credit_card (driver_id, card_nickname, card_number, card_expiry, card_cvv, card_type, is_default) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [driver_id, card_nickname || null, card_number, card_expiry, card_cvv, card_type || 'VISA', is_default ? 1 : 0]
      );
      return ins;
    });

    res.json({ message: "Card added", card_id: r.insertId });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// Set a card as default
app.post("/cards/set-default", async (req, res) => {
  try {
    const { driver_id, card_id } = req.body || {};
    if (!driver_id || !card_id) return res.json({ error: "driver_id and card_id required" });

    await withTransaction(async (conn) => {
      // Unset all defaults for this driver
      await conn.query("UPDATE credit_card SET is_default = 0 WHERE driver_id = ?", [driver_id]);
      // Set the selected card as default
      await conn.query("UPDATE credit_card SET is_default = 1 WHERE card_id = ? AND driver_id = ?", [card_id, driver_id]);
    });

    res.json({ message: "Default card updated" });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// Delete a card
app.delete("/cards/:cardId", async (req, res) => {
  try {
    const cardId = Number(req.params.cardId);
    const driver_id = Number(req.query.driver_id);
    
    if (!driver_id) return res.json({ error: "driver_id query param required" });

    await db.query("DELETE FROM credit_card WHERE card_id = ? AND driver_id = ?", [cardId, driver_id]);
    res.json({ message: "Card deleted" });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// -----------------------------
// LOTS
// -----------------------------
app.get("/lots/nearby", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT p.lot_id, c.camera_id, p.lot_name, p.location, p.opening_hours,
              p.entry_fee, p.hourly_rate, p.spot_count, p.lat, p.lng, p.currency
       FROM parking_lot p
       JOIN camera c ON c.lot_id = p.lot_id
       ORDER BY p.lot_id`
    );

    // match frontend fields (name/address/total_spots)
    const out = rows.map(r => ({
      lot_id: r.lot_id,
      camera_id: r.camera_id,
      name: r.lot_name,
      address: r.location,
      opening_hours: r.opening_hours,
      entry_fee: Number(r.entry_fee),
      hourly_rate: Number(r.hourly_rate),
      total_spots: r.spot_count,
      lat: r.lat,
      lng: r.lng
    }));

    res.json(out);
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// -----------------------------
// SESSION start/end + active lookup
// -----------------------------
app.post("/session/start", async (req, res) => {
  try {
    const { driver_id, plate_no, lot_id, spot_id, spot_label } = req.body || {};
    if (!driver_id || !plate_no || !lot_id) return res.json({ error: "Missing fields" });

    await withTransaction(async (conn) => {
      // Block if driver has any UNPAID sessions - must pay first!
      const [unpaid] = await conn.query(
        `SELECT COUNT(*) AS cnt FROM \`log\` WHERE driver_id = ? AND status = 'UNPAID'`,
        [driver_id]
      );
      if (unpaid[0].cnt > 0) {
        throw new Error("Cannot reserve: you have unpaid parking fees. Please pay first.");
      }

      // Enforce: driver cannot have > 1 ACTIVE session (also enforced via DB trigger)
      const [active] = await conn.query(
        `SELECT 1 FROM \`log\` WHERE driver_id = ? AND status = 'ACTIVE' LIMIT 1`,
        [driver_id]
      );
      if (active.length) throw new Error("Driver already has an ACTIVE session");

      // Block if this spot is already ACTIVE in this lot
      if (spot_label) {
        const [taken] = await conn.query(
          `SELECT 1
           FROM \`log\`
           WHERE lot_id = ?
             AND spot_label = ?
             AND status = 'ACTIVE'
           LIMIT 1`,
          [lot_id, spot_label]
        );
        if (taken.length) throw new Error("Spot already taken (ACTIVE)");
      }

      // Insert ACTIVE
      // Use INSERT...SELECT so camera_id is guaranteed to exist (avoids FK errors).
      const [r] = await conn.query(
        `INSERT INTO \`log\` (driver_id, plate_no, lot_id, camera_id, spot_id, spot_label, status)
         SELECT ?, ?, ?, c.camera_id, ?, ?, 'ACTIVE'
         FROM camera c
         WHERE c.lot_id = ?
         LIMIT 1`,
        [driver_id, plate_no, lot_id, spot_id || null, spot_label || null, lot_id]
      );
      if (!r.affectedRows) throw new Error("Lot has no camera");
    });

    res.json({ message: "Session started" });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

app.post("/session/end", async (req, res) => {
  try {
    const { plate_no } = req.body || {};
    if (!plate_no) return res.json({ error: "plate_no required" });

    // find ACTIVE session by plate
    const [rows] = await db.query(
      `SELECT l.log_id, l.entry_time, l.lot_id, p.entry_fee, p.hourly_rate
       FROM \`log\` l
       JOIN parking_lot p ON p.lot_id = l.lot_id
       WHERE l.plate_no = ? AND l.status = 'ACTIVE'
       ORDER BY l.log_id DESC
       LIMIT 1`,
      [plate_no]
    );

    if (!rows.length) return res.json({ error: "No ACTIVE session for this plate" });

    const s = rows[0];
    const exitTime = new Date();
    const fee = calcFee(s.entry_time, exitTime, s.entry_fee, s.hourly_rate);

    await db.query(
      `UPDATE \`log\`
       SET exit_time = ?, fee = ?, status = 'UNPAID'
       WHERE log_id = ?`,
      [exitTime, fee, s.log_id]
    );

    res.json({ message: "Exit processed", log_id: s.log_id, fee });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// Get ACTIVE spot labels for a given lot (used to paint reserved/yellow spots)
app.get("/session/active_spots", async (req, res) => {
  try {
    const lot_id = Number(req.query.lot_id);
    if (!lot_id) return res.json({ error: "Missing lot_id" });

    const [rows] = await db.query(
      `SELECT spot_label
       FROM \`log\`
       WHERE lot_id = ?
         AND status = 'ACTIVE'
         AND spot_label IS NOT NULL`,
      [lot_id]
    );

    // Return array like ["P005","P010",...]
    res.json(rows.map(r => r.spot_label));
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// Check if driver has any UNPAID sessions (used by frontend to block reservation)
app.get("/session/has_unpaid", async (req, res) => {
  try {
    const driver_id = Number(req.query.driver_id);
    if (!driver_id) return res.json({ error: "driver_id required" });

    const [rows] = await db.query(
      `SELECT COUNT(*) AS cnt FROM \`log\` WHERE driver_id = ? AND status = 'UNPAID'`,
      [driver_id]
    );

    const hasUnpaid = rows[0].cnt > 0;
    res.json({ has_unpaid: hasUnpaid, unpaid_count: rows[0].cnt });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

app.get("/session/active", async (req, res) => {
  try {
    const driver_id = Number(req.query.driver_id);
    const plate_no = String(req.query.plate_no || "");
    if (!driver_id || !plate_no) return res.json({ error: "driver_id and plate_no required" });

    const [rows] = await db.query(
      `SELECT log_id, lot_id, camera_id, spot_id, spot_label, entry_time
       FROM \`log\`
       WHERE driver_id = ? AND plate_no = ? AND status = 'ACTIVE'
       ORDER BY log_id DESC
       LIMIT 1`,
      [driver_id, plate_no]
    );

    if (!rows.length) return res.json({ error: "No ACTIVE session found" });
    res.json(rows[0]);
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// -----------------------------
// LOGS
// -----------------------------
app.get("/logs/driver/:driverId", async (req, res) => {
  try {
    const driverId = Number(req.params.driverId);
    const [rows] = await db.query(
      `SELECT l.log_id, l.plate_no, l.lot_id, p.lot_name, l.spot_label,
              l.entry_time, l.exit_time, l.fee, l.status
       FROM \`log\` l
       JOIN parking_lot p ON p.lot_id = l.lot_id
       WHERE l.driver_id = ?
       ORDER BY l.log_id DESC`,
      [driverId]
    );
    res.json(rows);
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// -----------------------------
// PAYMENTS
// -----------------------------
app.get("/payments/due/:driverId", async (req, res) => {
  try {
    const driverId = Number(req.params.driverId);
    const [rows] = await db.query(
      `SELECT log_id, fee
       FROM \`log\`
       WHERE driver_id = ? AND status = 'UNPAID'
       ORDER BY log_id DESC`,
      [driverId]
    );
    res.json(rows);
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

app.post("/payment/pay", async (req, res) => {
  try {
    const { driver_id, log_id, credit_card_no, ccv_cvc, cc_expiry } = req.body || {};
    if (!driver_id || !log_id) return res.json({ error: "driver_id and log_id required" });

    const amount = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        `SELECT fee, status FROM \`log\` WHERE log_id = ? AND driver_id = ? LIMIT 1`,
        [log_id, driver_id]
      );

      if (!rows.length) throw new Error("Log not found");
      if (rows[0].status !== "UNPAID") throw new Error("This log is not UNPAID");

      const amt = money2(rows[0].fee);

      // mark PAID
      await conn.query(`UPDATE \`log\` SET status='PAID' WHERE log_id = ?`, [log_id]);

      // record payment (simulated)
      await conn.query(
        `INSERT INTO payment (driver_id, log_id, credit_card_no, ccv_cvc, cc_expiry, amount, payment_status)
         VALUES (?, ?, ?, ?, ?, ?, 'PAID')`,
        [driver_id, log_id, credit_card_no || null, ccv_cvc || null, cc_expiry || null, amt]
      );

      return amt;
    });

    res.json({ message: `Payment processed. You paid $${amount.toFixed(2)}`, amount });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

app.post("/payment/pay_all", async (req, res) => {
  try {
    const { driver_id, credit_card_no, ccv_cvc, cc_expiry } = req.body || {};
    if (!driver_id) return res.json({ error: "driver_id required" });

    const count = await withTransaction(async (conn) => {
      const [due] = await conn.query(
        `SELECT log_id, fee
         FROM \`log\`
         WHERE driver_id = ? AND status = 'UNPAID'`,
        [driver_id]
      );

      if (!due.length) return 0;

      for (const item of due) {
        const amount = money2(item.fee);

        await conn.query(`UPDATE \`log\` SET status='PAID' WHERE log_id = ?`, [item.log_id]);

        await conn.query(
          `INSERT INTO payment (driver_id, log_id, credit_card_no, ccv_cvc, cc_expiry, amount, payment_status)
           VALUES (?, ?, ?, ?, ?, ?, 'PAID')`,
          [driver_id, item.log_id, credit_card_no || null, ccv_cvc || null, cc_expiry || null, amount]
        );
      }

      return due.length;
    });

    if (!count) return res.json({ message: "No unpaid logs" });
    res.json({ message: `All due paid (${count} logs).` });
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// -----------------------------
// REPORT QUERIES (for demo + rubric)
// -----------------------------
// Aggregate + GROUP BY
app.get("/reports/lot_summary", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT 
         p.lot_id,
         p.lot_name,
         COUNT(l.log_id) AS total_sessions,
         SUM(CASE WHEN l.status='ACTIVE' THEN 1 ELSE 0 END) AS active_sessions,
         SUM(CASE WHEN l.status IN ('UNPAID','PAID') THEN 1 ELSE 0 END) AS completed_sessions,
         COALESCE(SUM(CASE WHEN l.status IN ('UNPAID','PAID') THEN l.fee ELSE 0 END),0) AS total_revenue
       FROM parking_lot p
       LEFT JOIN \`log\` l ON l.lot_id = p.lot_id
       GROUP BY p.lot_id, p.lot_name
       ORDER BY p.lot_id`
    );
    res.json(rows);
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// Nested query
app.get("/reports/unpaid_above_average", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT d.driver_id, d.full_name, t.unpaid_total
       FROM driver d
       JOIN (
         SELECT driver_id, COALESCE(SUM(fee),0) AS unpaid_total
         FROM \`log\`
         WHERE status='UNPAID'
         GROUP BY driver_id
       ) t ON t.driver_id = d.driver_id
       WHERE t.unpaid_total > (
         SELECT AVG(x.unpaid_total)
         FROM (
           SELECT COALESCE(SUM(fee),0) AS unpaid_total
           FROM \`log\`
           WHERE status='UNPAID'
           GROUP BY driver_id
         ) x
       )
       ORDER BY t.unpaid_total DESC`
    );
    res.json(rows);
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// Set operation (UNION)
app.get("/reports/plates_union", async (req, res) => {
  try {
    const [rows] = await db.query(
      `(SELECT DISTINCT plate_no AS plate, 'EVER_PARKED' AS source FROM \`log\`)
       UNION
       (SELECT DISTINCT plate_no AS plate, 'UNPAID' AS source FROM \`log\` WHERE status='UNPAID')
       ORDER BY plate`
    );
    res.json(rows);
  } catch (e) {
    res.json({ error: String(e.message || e) });
  }
});

// -----------------------------
// Start server + nice EADDRINUSE message
// -----------------------------
const PORT = Number(process.env.PORT || 3000);
const server = app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`❌ Port ${PORT} is already in use.
✅ Fix: close the other terminal running node OR use another port in .env (PORT=3001).`);
    process.exit(1);
  }
  throw err;
});

const { query } = require('./db');
const { sendAlertEmail } = require('./emailService');
const { getIO } = require('../socket/emitter');

// Cooldown check via DB — survives process restarts and works across PM2 instances.
// Looks for an un-resolved alert for this device+pollutant created within the cooldown window.
async function isCoolingDown(deviceId, pollutant, cooldownMinutes) {
  const { rows } = await query(
    `SELECT 1 FROM alerts
     WHERE device_id = $1 AND pollutant = $2
       AND resolved_at IS NULL
       AND ts > NOW() - ($3 || ' minutes')::interval
     LIMIT 1`,
    [deviceId, pollutant, cooldownMinutes]
  );
  return rows.length > 0;
}

async function processReading(deviceId, reading, readingId) {
  // Load alert rules for this device + user
  const { rows: rules } = await query(
    `SELECT ar.* FROM alert_rules ar
     JOIN user_devices ud ON ud.user_id = ar.user_id
     WHERE ud.device_id = $1
       AND (ar.device_id = $1 OR ar.device_id IS NULL)`,
    [deviceId]
  );

  const io = getIO();

  for (const rule of rules) {
    const pollutant = rule.pollutant;
    const value = reading[pollutant];
    if (value == null) continue;

    let level = null;
    let threshold = null;

    if (value > rule.crit_threshold) {
      level = 'CRITICAL'; threshold = rule.crit_threshold;
    } else if (value > rule.warn_threshold) {
      level = 'WARNING'; threshold = rule.warn_threshold;
    }

    if (!level) {
      // Resolve open alert if value returned to safe
      const { rows: open } = await query(
        `SELECT id FROM alerts
         WHERE device_id = $1 AND pollutant = $2
           AND acknowledged = false AND resolved_at IS NULL
         LIMIT 1`,
        [deviceId, pollutant]
      );
      if (open.length) {
        await query(
          `UPDATE alerts SET resolved_at = NOW() WHERE id = $1`,
          [open[0].id]
        );
        if (io) io.to(`device:${deviceId}`).emit('alert:resolved', { alertId: open[0].id });
      }
      continue;
    }

    if (await isCoolingDown(deviceId, pollutant, rule.cooldown_min)) continue;

    // Create alert
    const { rows: [alert] } = await query(
      `INSERT INTO alerts (reading_id, device_id, pollutant, value, threshold, level)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, ts, pollutant, value, threshold, level, acknowledged`,
      [readingId, deviceId, pollutant, value, threshold, level]
    );

    const alertObj = { ...alert, ts: alert.ts.toISOString() };
    if (io) io.to(`device:${deviceId}`).emit('alert:new', alertObj);

    // Email notification
    try {
      const { rows: users } = await query(
        `SELECT u.email, d.name AS device_name
         FROM users u
         JOIN user_devices ud ON ud.user_id = u.id
         JOIN devices d ON d.id = ud.device_id
         WHERE ud.device_id = $1 LIMIT 1`,
        [deviceId]
      );
      if (users.length) {
        await sendAlertEmail(users[0].email, alertObj, { name: users[0].device_name });
      }
    } catch (e) {
      console.error('Alert email error:', e.message);
    }
  }
}

module.exports = { processReading };

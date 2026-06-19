const { query } = require('./db');
const { sendAlertEmail } = require('./emailService');
const { getIO } = require('../socket/emitter');

// Default thresholds applied when no user-defined rule exists for a pollutant.
// Values follow WHO / US EPA guidance for 24-hour exposure:
//   PM2.5:  warn 12 μg/m³ (EPA Annual NAAQS)  crit 35.4 μg/m³ (EPA 24h NAAQS)
//   PM10:   warn 54 μg/m³ (EPA 24h boundary)  crit 154 μg/m³ (EPA 24h NAAQS)
//   PM1:    no official standard; using WHO-informed conservative levels
const DEFAULT_THRESHOLDS = {
  pm25: { warn: 12,  crit: 35.4, cooldown_min: 15 },
  pm10: { warn: 54,  crit: 154,  cooldown_min: 15 },
  pm1:  { warn: 10,  crit: 25,   cooldown_min: 15 },
};

// Cooldown check via DB — survives process restarts and works across PM2 instances.
// Looks for an un-resolved alert for this device+pollutant created within the cooldown window.
async function isCoolingDown(deviceId, pollutant, cooldownMinutes) {
  const { rows } = await query(
    `SELECT 1 FROM alerts
     WHERE device_id = $1 AND pollutant = $2
       AND resolved_at IS NULL
       AND ts > NOW() - ($3 * interval '1 minute')
     LIMIT 1`,
    [deviceId, pollutant, cooldownMinutes]
  );
  return rows.length > 0;
}

async function processReading(deviceId, reading, readingId) {
  // Load alert rules for this device + user
  const { rows: dbRules } = await query(
    `SELECT ar.* FROM alert_rules ar
     JOIN user_devices ud ON ud.user_id = ar.user_id
     WHERE ud.device_id = $1
       AND (ar.device_id = $1 OR ar.device_id IS NULL)`,
    [deviceId]
  );

  // Merge DB rules with defaults: DB rule wins for any pollutant it covers.
  // Build a map: pollutant → effective rule object.
  const ruleMap = new Map();

  // Seed with defaults for PM pollutants provided by BMV080
  for (const [pollutant, defaults] of Object.entries(DEFAULT_THRESHOLDS)) {
    if (reading[pollutant] != null) {
      ruleMap.set(pollutant, {
        pollutant,
        warn_threshold: defaults.warn,
        crit_threshold: defaults.crit,
        cooldown_min:   defaults.cooldown_min,
        _isDefault:     true,
      });
    }
  }

  // DB rules always override defaults; also add any non-PM rules from DB
  for (const rule of dbRules) {
    ruleMap.set(rule.pollutant, { ...rule, _isDefault: false });
  }

  const rules = [...ruleMap.values()];

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

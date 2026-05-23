const express = require('express');
const { z } = require('zod');
const { query } = require('../services/db');
const { requireAuth } = require('../middleware/auth');
const { validate, validateQuery } = require('../middleware/validate');

const router = express.Router();

function fmtAlert(a) {
  return {
    id: a.id, ts: a.ts,
    deviceId: a.device_id, deviceName: a.device_name,
    pollutant: a.pollutant, value: a.value,
    threshold: a.threshold, level: a.level,
    acknowledged: a.acknowledged,
    acknowledgedAt: a.acknowledged_at,
    resolvedAt: a.resolved_at,
  };
}

// GET /api/alerts
const listSchema = z.object({
  deviceId: z.string().optional(),
  pollutant: z.string().optional(),
  level: z.enum(['WARNING', 'CRITICAL']).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

router.get('/', requireAuth, validateQuery(listSchema), async (req, res) => {
  const { deviceId, pollutant, level, from, to, limit } = req.query;
  try {
    const params = [req.user.userId];
    let where = '';
    let i = 2;

    if (deviceId)  { where += ` AND a.device_id = $${i++}`; params.push(deviceId); }
    if (pollutant) { where += ` AND a.pollutant = $${i++}`; params.push(pollutant); }
    if (level)     { where += ` AND a.level = $${i++}`; params.push(level); }
    if (from)      { where += ` AND a.ts >= $${i++}`; params.push(from); }
    if (to)        { where += ` AND a.ts <= $${i++}`; params.push(to); }

    params.push(limit);
    const { rows } = await query(
      `SELECT a.*, d.name AS device_name
       FROM alerts a
       JOIN devices d ON d.id = a.device_id
       JOIN user_devices ud ON ud.device_id = a.device_id
       WHERE ud.user_id = $1 ${where}
       ORDER BY a.ts DESC LIMIT $${i}`,
      params
    );
    res.json(rows.map(fmtAlert));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/alerts/active
router.get('/active', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT a.*, d.name AS device_name
       FROM alerts a
       JOIN devices d ON d.id = a.device_id
       JOIN user_devices ud ON ud.device_id = a.device_id
       WHERE ud.user_id = $1
         AND a.acknowledged = false
         AND a.resolved_at IS NULL
       ORDER BY a.ts DESC`,
      [req.user.userId]
    );
    res.json(rows.map(fmtAlert));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/alerts/:id/ack
router.patch('/:id/ack', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `UPDATE alerts a
       SET acknowledged = true, acknowledged_at = NOW()
       FROM user_devices ud
       WHERE a.device_id = ud.device_id
         AND ud.user_id = $1
         AND a.id = $2
       RETURNING a.*`,
      [req.user.userId, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Alert not found' });
    res.json(fmtAlert(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/alerts/ack-all
router.post('/ack-all', requireAuth, async (req, res) => {
  try {
    await query(
      `UPDATE alerts a
       SET acknowledged = true, acknowledged_at = NOW()
       FROM user_devices ud
       WHERE a.device_id = ud.device_id
         AND ud.user_id = $1
         AND a.acknowledged = false`,
      [req.user.userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/alerts/rules
router.get('/rules', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM alert_rules WHERE user_id = $1 ORDER BY pollutant`,
      [req.user.userId]
    );
    res.json(rows.map((r) => ({
      id: r.id, pollutant: r.pollutant, deviceId: r.device_id,
      warnThreshold: r.warn_threshold, critThreshold: r.crit_threshold,
      cooldownMin: r.cooldown_min,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/alerts/rules
const rulesSchema = z.object({
  rules: z.array(z.object({
    pollutant: z.string().min(1),
    warnThreshold: z.number().min(0),
    critThreshold: z.number().min(0),
    cooldownMin: z.number().int().min(1).max(1440).default(15),
    deviceId: z.string().optional().nullable(),
  })),
});

router.put('/rules', requireAuth, validate(rulesSchema), async (req, res) => {
  const { rules } = req.body;
  try {
    for (const rule of rules) {
      await query(
        `INSERT INTO alert_rules (user_id, device_id, pollutant, warn_threshold, crit_threshold, cooldown_min)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, device_id, pollutant)
         DO UPDATE SET
           warn_threshold = EXCLUDED.warn_threshold,
           crit_threshold = EXCLUDED.crit_threshold,
           cooldown_min   = EXCLUDED.cooldown_min`,
        [
          req.user.userId,
          rule.deviceId || null,
          rule.pollutant,
          rule.warnThreshold,
          rule.critThreshold,
          rule.cooldownMin || 15,
        ]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

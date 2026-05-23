const express = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../services/db');
const { requireAuth } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const rateLimit = require('express-rate-limit');
const { publish } = require('../mqtt/subscriber');
const { emitDeviceClaimed } = require('../socket/emitter');

const provisionLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

const router = express.Router();

// Helper: verify ownership, returns device row or null
async function ownsDevice(userId, deviceId) {
  const { rows } = await query(
    `SELECT d.* FROM devices d
     JOIN user_devices ud ON ud.device_id = d.id
     WHERE ud.user_id = $1 AND d.id = $2`,
    [userId, deviceId]
  );
  return rows[0] || null;
}

function fmtDevice(d, latest = null) {
  return {
    id: d.id,
    name: d.name,
    location: d.location,
    type: d.type,
    firmwareVersion: d.firmware_version,
    lastSeen: d.last_seen,
    status: d.status,
    latestReading: latest ? fmtReading(latest) : null,
  };
}

function fmtReading(r) {
  if (!r) return null;
  return {
    id: r.id, ts: r.ts,
    pm25: r.pm25, pm10: r.pm10, pm1: r.pm1,
    co: r.co, no2: r.no2, co2: r.co2, o3: r.o3, voc: r.voc,
    temp: r.temp, rh: r.rh, aqi: r.aqi, primaryPollutant: r.primary_pollutant,
  };
}

// GET /api/devices
router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows: devices } = await query(
      `SELECT d.*, r.id AS r_id, r.ts AS r_ts,
         r.pm25, r.pm10, r.pm1, r.co, r.no2, r.co2, r.o3, r.voc,
         r.temp, r.rh, r.aqi, r.primary_pollutant
       FROM devices d
       JOIN user_devices ud ON ud.device_id = d.id
       LEFT JOIN LATERAL (
         SELECT * FROM readings WHERE device_id = d.id ORDER BY ts DESC LIMIT 1
       ) r ON true
       WHERE ud.user_id = $1
       ORDER BY d.created_at`,
      [req.user.userId]
    );
    res.json(devices.map((d) => fmtDevice(d, d.r_id ? { id: d.r_id, ts: d.r_ts, pm25: d.pm25, pm10: d.pm10, pm1: d.pm1, co: d.co, no2: d.no2, co2: d.co2, o3: d.o3, voc: d.voc, temp: d.temp, rh: d.rh, aqi: d.aqi, primary_pollutant: d.primary_pollutant } : null)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/devices/claim
const claimSchema = z.object({
  device_id: z.string().min(1),
  name: z.string().min(1).max(100).optional(),
});

router.post('/claim', requireAuth, validate(claimSchema), async (req, res) => {
  const { device_id, name } = req.body;
  try {
    const { rows: claimed } = await query(
      'SELECT user_id FROM user_devices WHERE device_id = $1',
      [device_id]
    );
    if (claimed.length) return res.status(409).json({ error: 'Device already claimed' });

    await query(
      `INSERT INTO devices (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [device_id, name || device_id]
    );
    await query(
      'INSERT INTO user_devices (user_id, device_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.user.userId, device_id]
    );
    const { rows: [d] } = await query('SELECT * FROM devices WHERE id = $1', [device_id]);
    res.status(201).json(fmtDevice(d));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/devices/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const device = await ownsDevice(req.user.userId, req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const { rows: [latest] } = await query(
      'SELECT * FROM readings WHERE device_id = $1 ORDER BY ts DESC LIMIT 1',
      [req.params.id]
    );
    res.json(fmtDevice(device, latest || null));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/devices/:id
const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  location: z.string().max(200).optional(),
  readingInterval: z.number().int().min(5).max(3600).optional(),
}).partial();

router.patch('/:id', requireAuth, validate(updateSchema), async (req, res) => {
  try {
    const device = await ownsDevice(req.user.userId, req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const sets = [], params = [];
    let i = 1;
    if (req.body.name !== undefined) { sets.push(`name = $${i++}`); params.push(req.body.name); }
    if (req.body.location !== undefined) { sets.push(`location = $${i++}`); params.push(req.body.location); }
    if (req.body.readingInterval !== undefined) { sets.push(`reading_interval = $${i++}`); params.push(req.body.readingInterval); }

    if (sets.length) {
      params.push(req.params.id);
      await query(`UPDATE devices SET ${sets.join(', ')} WHERE id = $${i}`, params);
    }
    const { rows: [d] } = await query('SELECT * FROM devices WHERE id = $1', [req.params.id]);
    res.json(fmtDevice(d));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/devices/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const device = await ownsDevice(req.user.userId, req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    // CASCADE handles readings, alerts, user_devices, alert_rules
    await query('DELETE FROM devices WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/devices/:id/status
router.get('/:id/status', requireAuth, async (req, res) => {
  try {
    const device = await ownsDevice(req.user.userId, req.params.id);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json({ status: device.status, lastSeen: device.last_seen });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/devices/:id/wifi  — sends new WiFi credentials to device over MQTT
router.post('/:id/wifi', requireAuth, async (req, res) => {
  const device = await ownsDevice(req.user.userId, req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const { ssid, password } = req.body;
  if (!ssid || !password) return res.status(400).json({ error: 'ssid and password required' });
  const sent = publish(`aewis/devices/${device.id}/cmd/wifi`, { ssid, password });
  res.json({ ok: true, delivered: sent, message: 'Wi-Fi re-provisioning command sent' });
});

// POST /api/devices/:id/ota  — triggers firmware update check
router.post('/:id/ota', requireAuth, async (req, res) => {
  const device = await ownsDevice(req.user.userId, req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const sent = publish(`aewis/devices/${device.id}/cmd/ota`, { trigger: true });
  res.json({ ok: true, delivered: sent, message: 'OTA firmware update command sent' });
});

// POST /api/devices/:id/reset  — factory reset
router.post('/:id/reset', requireAuth, async (req, res) => {
  const device = await ownsDevice(req.user.userId, req.params.id);
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const sent = publish(`aewis/devices/${device.id}/cmd/reset`, { factory: true });
  res.json({ ok: true, delivered: sent, message: 'Factory reset command sent' });
});

// POST /api/devices/pairing-code  — generate 6-digit code shown to user in dashboard
router.post('/pairing-code', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM pairing_codes WHERE expires_at < NOW()');
    let code;
    for (let attempt = 0; attempt < 10; attempt++) {
      code = String(Math.floor(100000 + Math.random() * 900000));
      const { rows } = await query('SELECT 1 FROM pairing_codes WHERE code = $1', [code]);
      if (!rows.length) break;
    }
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await query(
      'INSERT INTO pairing_codes (code, user_id, expires_at) VALUES ($1, $2, $3)',
      [code, req.user.userId, expiresAt]
    );
    res.json({ code, expires_at: expiresAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/devices/pairing-code/:code/status  — fallback poll (Socket.io is primary)
router.get('/pairing-code/:code/status', requireAuth, async (req, res) => {
  try {
    const { rows: [pc] } = await query(
      'SELECT * FROM pairing_codes WHERE code = $1 AND user_id = $2',
      [req.params.code, req.user.userId]
    );
    if (!pc) return res.status(404).json({ error: 'Code not found' });
    if (new Date() > new Date(pc.expires_at)) return res.json({ status: 'expired' });
    if (pc.claimed_at) return res.json({ status: 'claimed', device_id: pc.device_id });
    res.json({ status: 'pending' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/devices/provision  (unauthenticated — device calls this after WiFi connect)
const provisionSchema = z.object({
  device_id:        z.string().min(1).max(64),
  mac:              z.string().optional(),
  firmware_version: z.string().optional(),
  ip:               z.string().optional(),
  pairing_code:     z.string().length(6).regex(/^\d{6}$/).optional(),
});

router.post('/provision', provisionLimiter, validate(provisionSchema), async (req, res) => {
  const { device_id, mac, firmware_version, ip, pairing_code } = req.body;
  try {
    const token = uuidv4();
    await query(
      `INSERT INTO devices (id, name, status, last_seen, provision_token, mac_address, ip_address, firmware_version)
       VALUES ($1, $1, 'online', NOW(), $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         status           = 'online',
         last_seen        = NOW(),
         provision_token  = EXCLUDED.provision_token,
         mac_address      = COALESCE(EXCLUDED.mac_address, devices.mac_address),
         ip_address       = COALESCE(EXCLUDED.ip_address,  devices.ip_address),
         firmware_version = COALESCE(EXCLUDED.firmware_version, devices.firmware_version)`,
      [device_id, token, mac || null, ip || null, firmware_version || null]
    );

    // Auto-claim device to the user who generated the pairing code
    if (pairing_code) {
      const { rows: [pc] } = await query(
        `SELECT * FROM pairing_codes
         WHERE code = $1 AND expires_at > NOW() AND claimed_at IS NULL`,
        [pairing_code]
      );
      if (pc) {
        await query(
          'INSERT INTO user_devices (user_id, device_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [pc.user_id, device_id]
        );
        await query(
          'UPDATE pairing_codes SET claimed_at = NOW(), device_id = $1 WHERE code = $2',
          [device_id, pairing_code]
        );
        emitDeviceClaimed(pairing_code, device_id);
        console.log(`Device ${device_id} auto-claimed via pairing code ${pairing_code}`);
      }
    }

    res.json({ ok: true, provision_token: token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

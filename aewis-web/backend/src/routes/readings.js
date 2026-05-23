const express = require('express');
const { z } = require('zod');
const { query } = require('../services/db');
const { requireAuth } = require('../middleware/auth');
const { validateQuery } = require('../middleware/validate');

const router = express.Router();

async function ownsDevice(userId, deviceId) {
  const { rows } = await query(
    'SELECT 1 FROM user_devices WHERE user_id = $1 AND device_id = $2',
    [userId, deviceId]
  );
  return rows.length > 0;
}

function fmtReading(r) {
  return {
    id: r.id, ts: r.ts,
    pm25: r.pm25, pm10: r.pm10, pm1: r.pm1,
    co: r.co, no2: r.no2, co2: r.co2, o3: r.o3, voc: r.voc,
    temp: r.temp, rh: r.rh, aqi: r.aqi, primaryPollutant: r.primary_pollutant,
  };
}

// GET /api/readings/latest?deviceId=
const latestSchema = z.object({ deviceId: z.string().min(1) });

router.get('/latest', requireAuth, validateQuery(latestSchema), async (req, res) => {
  const { deviceId } = req.query;
  try {
    if (!await ownsDevice(req.user.userId, deviceId)) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      'SELECT * FROM readings WHERE device_id = $1 ORDER BY ts DESC LIMIT 1',
      [deviceId]
    );
    res.json(rows.length ? fmtReading(rows[0]) : null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/readings?deviceId=&from=&to=&interval=&limit=
const readingsSchema = z.object({
  deviceId: z.string().min(1),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  interval: z.enum(['raw', '1min', '5min', '1hour']).default('raw'),
  limit: z.coerce.number().int().min(1).max(10000).default(500),
});

router.get('/', requireAuth, validateQuery(readingsSchema), async (req, res) => {
  const { deviceId, from, to, interval, limit } = req.query;
  try {
    if (!await ownsDevice(req.user.userId, deviceId)) return res.status(403).json({ error: 'Forbidden' });

    const params = [deviceId];
    let where = 'device_id = $1';
    let i = 2;

    if (from) { where += ` AND ts >= $${i++}`; params.push(from); }
    if (to)   { where += ` AND ts <= $${i++}`; params.push(to); }

    if (interval === 'raw') {
      params.push(limit);
      const { rows } = await query(
        `SELECT * FROM readings WHERE ${where} ORDER BY ts DESC LIMIT $${i}`,
        params
      );
      return res.json(rows.map(fmtReading));
    }

    // Aggregated via date_trunc
    const trunc = { '1min': 'minute', '5min': 'minute', '1hour': 'hour' }[interval];
    const bucketExpr = interval === '5min'
      ? `date_trunc('minute', ts) - (EXTRACT(MINUTE FROM ts)::int % 5) * interval '1 min'`
      : `date_trunc('${trunc}', ts)`;

    params.push(limit);
    const { rows } = await query(
      `SELECT
         ${bucketExpr} AS ts,
         AVG(pm25) AS pm25, AVG(pm10) AS pm10, AVG(pm1) AS pm1,
         AVG(co) AS co, AVG(no2) AS no2, AVG(co2) AS co2,
         AVG(o3) AS o3, AVG(voc) AS voc,
         AVG(temp) AS temp, AVG(rh) AS rh,
         MAX(aqi) AS aqi,
         mode() WITHIN GROUP (ORDER BY primary_pollutant) AS primary_pollutant
       FROM readings
       WHERE ${where}
       GROUP BY 1
       ORDER BY 1 DESC
       LIMIT $${i}`,
      params
    );
    res.json(rows.map((r) => ({ ...fmtReading(r), id: null })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/readings/stats?deviceId=&from=&to=
const statsSchema = z.object({
  deviceId: z.string().min(1),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

router.get('/stats', requireAuth, validateQuery(statsSchema), async (req, res) => {
  const { deviceId, from, to } = req.query;
  try {
    if (!await ownsDevice(req.user.userId, deviceId)) return res.status(403).json({ error: 'Forbidden' });

    const params = [deviceId];
    let where = 'device_id = $1';
    let i = 2;
    if (from) { where += ` AND ts >= $${i++}`; params.push(from); }
    if (to)   { where += ` AND ts <= $${i++}`; params.push(to); }

    const { rows: [s] } = await query(
      `SELECT
         MIN(pm25) AS pm25_min, MAX(pm25) AS pm25_max, AVG(pm25) AS pm25_avg,
         MIN(pm10) AS pm10_min, MAX(pm10) AS pm10_max, AVG(pm10) AS pm10_avg,
         MIN(co)   AS co_min,   MAX(co)   AS co_max,   AVG(co)   AS co_avg,
         MIN(no2)  AS no2_min,  MAX(no2)  AS no2_max,  AVG(no2)  AS no2_avg,
         MIN(co2)  AS co2_min,  MAX(co2)  AS co2_max,  AVG(co2)  AS co2_avg,
         MIN(o3)   AS o3_min,   MAX(o3)   AS o3_max,   AVG(o3)   AS o3_avg,
         MIN(voc)  AS voc_min,  MAX(voc)  AS voc_max,  AVG(voc)  AS voc_avg,
         MIN(aqi)  AS aqi_min,  MAX(aqi)  AS aqi_max,  AVG(aqi)  AS aqi_avg,
         COUNT(*)  AS count
       FROM readings WHERE ${where}`,
      params
    );
    if (!s) return res.json({});

    const stat = (k) => ({ min: s[`${k}_min`], max: s[`${k}_max`], avg: s[`${k}_avg`] });
    res.json({
      pm25: stat('pm25'), pm10: stat('pm10'), co: stat('co'),
      no2: stat('no2'), co2: stat('co2'), o3: stat('o3'),
      voc: stat('voc'), aqi: stat('aqi'),
      count: parseInt(s.count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/readings/heatmap?deviceId=&year=
const heatmapSchema = z.object({
  deviceId: z.string().min(1),
  year: z.coerce.number().int().min(2020).max(2099),
});

router.get('/heatmap', requireAuth, validateQuery(heatmapSchema), async (req, res) => {
  const { deviceId, year } = req.query;
  try {
    if (!await ownsDevice(req.user.userId, deviceId)) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `SELECT
         EXTRACT(MONTH FROM ts)::int AS month,
         EXTRACT(DAY   FROM ts)::int AS day,
         AVG(aqi) AS avg_aqi
       FROM readings
       WHERE device_id = $1 AND EXTRACT(YEAR FROM ts) = $2
       GROUP BY 1, 2
       ORDER BY 1, 2`,
      [deviceId, year]
    );
    res.json(rows.map((r) => ({ month: r.month, day: r.day, avgAqi: parseFloat(r.avg_aqi) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/readings/hourly?deviceId=&date=YYYY-MM-DD
const hourlySchema = z.object({
  deviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

router.get('/hourly', requireAuth, validateQuery(hourlySchema), async (req, res) => {
  const { deviceId, date } = req.query;
  try {
    if (!await ownsDevice(req.user.userId, deviceId)) return res.status(403).json({ error: 'Forbidden' });
    const { rows } = await query(
      `SELECT
         EXTRACT(HOUR FROM ts)::int AS hour,
         AVG(aqi)  AS avg_aqi,
         AVG(pm25) AS avg_pm25,
         AVG(co)   AS avg_co,
         AVG(no2)  AS avg_no2,
         AVG(co2)  AS avg_co2,
         AVG(o3)   AS avg_o3,
         AVG(voc)  AS avg_voc
       FROM readings
       WHERE device_id = $1
         AND ts >= $2::date
         AND ts <  $2::date + INTERVAL '1 day'
       GROUP BY 1
       ORDER BY 1`,
      [deviceId, date]
    );
    res.json(rows.map((r) => ({
      hour: r.hour,
      avgAqi: parseFloat(r.avg_aqi), avgPm25: parseFloat(r.avg_pm25),
      avgCo: parseFloat(r.avg_co), avgNo2: parseFloat(r.avg_no2),
      avgCo2: parseFloat(r.avg_co2), avgO3: parseFloat(r.avg_o3),
      avgVoc: parseFloat(r.avg_voc),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

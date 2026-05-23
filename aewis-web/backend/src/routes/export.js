const express = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { query } = require('../services/db');
const { requireAuth } = require('../middleware/auth');
const { validateQuery } = require('../middleware/validate');

const router = express.Router();
const EXPORT_DIR = path.join(__dirname, '../../../exports');
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

// In-memory job store (sufficient for single-process; use Redis in multi-instance)
const jobs = new Map();

function aqiCategory(aqi) {
  if (!aqi) return '';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

async function ownsDevice(userId, deviceId) {
  const { rows } = await query(
    'SELECT 1 FROM user_devices WHERE user_id = $1 AND device_id = $2',
    [userId, deviceId]
  );
  return rows.length > 0;
}

function buildWhere(deviceId, from, to, params) {
  let where = 'device_id = $1';
  let i = 2;
  params.push(deviceId);
  if (from) { where += ` AND ts >= $${i++}`; params.push(from); }
  if (to)   { where += ` AND ts <= $${i++}`; params.push(to); }
  return { where, nextIdx: i };
}

// GET /api/export/csv
const csvSchema = z.object({
  deviceId: z.string().min(1),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  interval: z.enum(['raw', '1min', '5min', '1hour']).default('raw'),
});

router.get('/csv', requireAuth, validateQuery(csvSchema), async (req, res) => {
  const { deviceId, from, to } = req.query;
  if (!await ownsDevice(req.user.userId, deviceId)) return res.status(403).json({ error: 'Forbidden' });

  const params = [];
  const { where, nextIdx: i } = buildWhere(deviceId, from, to, params);

  const { rows: [{ c }] } = await query(`SELECT COUNT(*) AS c FROM readings WHERE ${where}`, params);
  const count = parseInt(c);

  if (count > 10000) {
    const jobId = uuidv4();
    jobs.set(jobId, { status: 'pending', userId: req.user.userId });
    generateCsvAsync(jobId, deviceId, from, to, req.user);
    return res.status(202).json({ jobId });
  }

  const { rows } = await query(
    `SELECT * FROM readings WHERE ${where} ORDER BY ts ASC`,
    params
  );

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="aewis-${deviceId}.csv"`);
  res.write('timestamp,pm1,pm25,pm10,co,no2,co2,o3,voc,temp,rh,aqi,aqi_category\n');
  for (const r of rows) {
    const aqi = r.aqi ? parseFloat(r.aqi) : null;
    res.write([
      r.ts?.toISOString(), r.pm1, r.pm25, r.pm10,
      r.co, r.no2, r.co2, r.o3, r.voc, r.temp, r.rh,
      aqi, aqiCategory(aqi),
    ].join(',') + '\n');
  }
  res.end();
});

async function generateCsvAsync(jobId, deviceId, from, to, user) {
  try {
    jobs.set(jobId, { status: 'running', userId: user.userId });
    const params = [];
    const { where } = buildWhere(deviceId, from, to, params);
    const { rows } = await query(`SELECT * FROM readings WHERE ${where} ORDER BY ts ASC`, params);

    const filePath = path.join(EXPORT_DIR, `${jobId}.csv`);
    const stream = fs.createWriteStream(filePath);
    stream.write('timestamp,pm1,pm25,pm10,co,no2,co2,o3,voc,temp,rh,aqi,aqi_category\n');
    for (const r of rows) {
      const aqi = r.aqi ? parseFloat(r.aqi) : null;
      stream.write([r.ts?.toISOString(), r.pm1, r.pm25, r.pm10, r.co, r.no2, r.co2, r.o3, r.voc, r.temp, r.rh, aqi, aqiCategory(aqi)].join(',') + '\n');
    }
    stream.end(() => jobs.set(jobId, { status: 'done', userId: user.userId, filePath }));
  } catch (err) {
    jobs.set(jobId, { status: 'error', error: err.message, userId: user.userId });
  }
}

// POST /api/export/pdf
router.post('/pdf', requireAuth, async (req, res) => {
  const { deviceId, from, to } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  if (!await ownsDevice(req.user.userId, deviceId)) return res.status(403).json({ error: 'Forbidden' });

  const { rows: [d] } = await query('SELECT name FROM devices WHERE id = $1', [deviceId]);
  const jobId = uuidv4();
  jobs.set(jobId, { status: 'pending', userId: req.user.userId });
  generatePdfAsync(jobId, deviceId, from, to, d?.name || deviceId, req.user);
  res.status(202).json({ jobId });
});

async function generatePdfAsync(jobId, deviceId, from, to, deviceName, user) {
  try {
    jobs.set(jobId, { status: 'running', userId: user.userId });
    const PDFDocument = require('pdfkit');

    const params = [];
    const { where } = buildWhere(deviceId, from, to, params);
    const [{ rows }, { rows: [stats] }] = await Promise.all([
      query(`SELECT * FROM readings WHERE ${where} ORDER BY ts ASC LIMIT 5000`, params),
      query(`SELECT MIN(aqi) AS min, MAX(aqi) AS max, AVG(aqi) AS avg, COUNT(*) AS cnt FROM readings WHERE ${where}`, params),
    ]);

    const filePath = path.join(EXPORT_DIR, `${jobId}.pdf`);
    const doc = new PDFDocument({ margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(20).text('AEWIS Air Quality Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Device: ${deviceName}`);
    if (from) doc.text(`From: ${from}`);
    if (to)   doc.text(`To: ${to}`);
    doc.moveDown();

    if (stats) {
      doc.fontSize(14).text('Summary Statistics');
      doc.fontSize(11)
        .text(`AQI Min: ${parseFloat(stats.min || 0).toFixed(1)}`)
        .text(`AQI Max: ${parseFloat(stats.max || 0).toFixed(1)}`)
        .text(`AQI Avg: ${parseFloat(stats.avg || 0).toFixed(1)}`)
        .text(`Total Readings: ${stats.cnt}`);
    }

    doc.moveDown();
    doc.fontSize(14).text('Recent Readings (last 20)');
    for (const r of rows.slice(-20)) {
      doc.fontSize(9).text(
        `${r.ts?.toISOString().slice(0, 19)} | PM2.5: ${r.pm25 ?? '-'} | CO: ${r.co ?? '-'} | AQI: ${r.aqi ?? '-'}`
      );
    }

    doc.end();
    stream.on('finish', () => jobs.set(jobId, { status: 'done', userId: user.userId, filePath }));
  } catch (err) {
    jobs.set(jobId, { status: 'error', error: err.message, userId: user.userId });
  }
}

// GET /api/export/status/:jobId
router.get('/status/:jobId', requireAuth, (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.userId !== req.user.userId) return res.status(404).json({ error: 'Job not found' });
  res.json({ status: job.status, error: job.error });
});

// GET /api/export/download/:jobId
router.get('/download/:jobId', requireAuth, (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job || job.userId !== req.user.userId || job.status !== 'done') {
    return res.status(404).json({ error: 'Export not ready' });
  }
  res.download(job.filePath);
});

module.exports = router;

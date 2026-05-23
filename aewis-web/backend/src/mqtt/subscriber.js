const { v4: uuidv4 } = require('uuid');
const { query }       = require('../services/db');
const { emitProvision, emitSensorUpdate, emitDeviceStatus } = require('../socket/emitter');
const { calcAQI }     = require('../services/aqiCalc');
const { processReading } = require('../services/alertEngine');
const { startBroker, getBroker, publish } = require('./broker');

function start() {
  const broker = startBroker();

  // Only handle messages from real clients (client === null means server-internal)
  broker.on('publish', async (packet, client) => {
    if (!client) return;

    const topic   = packet.topic;
    const payload = packet.payload.toString();

    try {
      const parts    = topic.split('/');
      const deviceId = parts[2];
      const type     = parts[3];
      if (!deviceId || !type) return;

      const data = JSON.parse(payload);

      if (type === 'status')    { await handleStatus(deviceId, data);    return; }
      if (type === 'provision') { await handleProvision(deviceId, data); return; }
      if (type === 'readings')  { await handleReading(deviceId, data);   return; }
    } catch (err) {
      console.error('MQTT message error:', err.message, '| topic:', topic);
    }
  });
}

async function handleProvision(deviceId, data) {
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
    [deviceId, token, data.mac || null, data.ip || null, data.firmware || null]
  );
  emitProvision(deviceId, { ok: true });
  console.log(`Device provisioned via MQTT: ${deviceId}`);
}

async function handleStatus(deviceId, data) {
  const status = data.status || 'online';
  await query(
    'UPDATE devices SET status = $1, last_seen = NOW() WHERE id = $2',
    [status, deviceId]
  );
  emitDeviceStatus(deviceId, status);
}

async function handleReading(deviceId, data) {
  const { rows } = await query('SELECT id FROM devices WHERE id = $1', [deviceId]);
  if (!rows.length) {
    console.warn(`MQTT reading for unknown device: ${deviceId}`);
    return;
  }

  const { aqi, primaryPollutant } = calcAQI(data);
  const readingId = uuidv4();

  const { rows: [reading] } = await query(
    `INSERT INTO readings
       (id, device_id, ts, pm25, pm10, pm1, co, no2, co2, o3, voc, temp, rh, aqi, primary_pollutant)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      readingId, deviceId,
      data.ts ? new Date(data.ts) : new Date(),
      data.pm25 ?? null, data.pm10 ?? null, data.pm1 ?? null,
      data.co   ?? null, data.no2  ?? null, data.co2  ?? null,
      data.o3   ?? null, data.voc  ?? null,
      data.temp ?? null, data.rh   ?? null,
      aqi, primaryPollutant,
    ]
  );

  await query(
    'UPDATE devices SET last_seen = NOW(), status = $1 WHERE id = $2',
    ['online', deviceId]
  );

  const readingObj = {
    id: reading.id, ts: reading.ts,
    pm25: reading.pm25, pm10: reading.pm10, pm1: reading.pm1,
    co: reading.co, no2: reading.no2, co2: reading.co2,
    o3: reading.o3, voc: reading.voc,
    temp: reading.temp, rh: reading.rh,
    aqi: reading.aqi, primaryPollutant: reading.primary_pollutant,
  };

  emitSensorUpdate(deviceId, readingObj);
  await processReading(deviceId, readingObj, readingId);
}

function stop() {
  const broker = getBroker();
  if (broker) broker.close();
}

module.exports = { start, stop, publish };

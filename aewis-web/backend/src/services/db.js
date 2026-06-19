const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Neon
  max: 5,
  idleTimeoutMillis: 10000,      // release connections after 10s idle (Neon suspends at ~5min)
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
});

/**
 * Run a parameterized query.
 * Usage: query('SELECT * FROM users WHERE id = $1', [id])
 */
async function query(text, params) {
  let client = await pool.connect();
  try {
    return await client.query(text, params);
  } catch (err) {
    // Neon suspends idle compute — retry once on a fresh connection
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET') {
      client.release(err); // discard dead connection from pool
      client = null;
      const retry = await pool.connect();
      try {
        return await retry.query(text, params);
      } finally {
        retry.release();
      }
    }
    throw err;
  } finally {
    if (client) client.release();
  }
}

/**
 * Initialize all tables and indexes on startup.
 */
async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email       TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'user',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS devices (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      location          TEXT,
      type              TEXT,
      firmware_version  TEXT,
      last_seen         TIMESTAMPTZ,
      status            TEXT NOT NULL DEFAULT 'offline',
      reading_interval  INT DEFAULT 60,
      provision_token   TEXT,
      mac_address       TEXT,
      ip_address        TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS user_devices (
      user_id    UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
      device_id  TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, device_id)
    );

    CREATE TABLE IF NOT EXISTS readings (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      device_id        TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      ts               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      pm25             REAL,
      pm10             REAL,
      pm1              REAL,
      co               REAL,
      no2              REAL,
      co2              REAL,
      o3               REAL,
      voc              REAL,
      temp             REAL,
      rh               REAL,
      aqi              REAL,
      primary_pollutant TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_readings_device_ts
      ON readings (device_id, ts DESC);

    CREATE TABLE IF NOT EXISTS alerts (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      reading_id      UUID REFERENCES readings(id) ON DELETE SET NULL,
      device_id       TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      ts              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      pollutant       TEXT NOT NULL,
      value           REAL NOT NULL,
      threshold       REAL NOT NULL,
      level           TEXT NOT NULL,
      acknowledged    BOOLEAN NOT NULL DEFAULT false,
      acknowledged_at TIMESTAMPTZ,
      resolved_at     TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_device_ts
      ON alerts (device_id, ts DESC);

    -- Migration: add provisioning columns to existing databases
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS provision_token TEXT;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS mac_address TEXT;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip_address TEXT;

    -- Migration: add BMV080 particulate matter columns to existing databases
    ALTER TABLE readings ADD COLUMN IF NOT EXISTS pm1  REAL;
    ALTER TABLE readings ADD COLUMN IF NOT EXISTS pm25 REAL;
    ALTER TABLE readings ADD COLUMN IF NOT EXISTS pm10 REAL;

    CREATE TABLE IF NOT EXISTS pairing_codes (
      code       CHAR(6)      PRIMARY KEY,
      user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id  TEXT         REFERENCES devices(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ  NOT NULL,
      claimed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_pairing_codes_user
      ON pairing_codes (user_id, expires_at DESC);

    CREATE TABLE IF NOT EXISTS alert_rules (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
      device_id       TEXT          REFERENCES devices(id) ON DELETE CASCADE,
      pollutant       TEXT NOT NULL,
      warn_threshold  REAL NOT NULL,
      crit_threshold  REAL NOT NULL,
      cooldown_min    INT  NOT NULL DEFAULT 15,
      UNIQUE (user_id, device_id, pollutant)
    );
  `);
  console.log('PostgreSQL schema initialized');
}

module.exports = { pool, query, initSchema };

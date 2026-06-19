const mqtt = require('mqtt');

let client = null;

function startBroker() {
  // Support both MQTT_URL (full URL) and MQTT_PORT (local broker on localhost)
  const url = process.env.MQTT_URL ||
    `mqtt://localhost:${process.env.MQTT_PORT || 1883}`;
  const username = process.env.MQTT_USER;
  const password = process.env.MQTT_PASSWORD;

  client = mqtt.connect(url, {
    username,
    password,
    clientId: `aewis-backend-${Math.random().toString(16).slice(2, 8)}`,
    // Reconnect automatically; back off up to 30 s
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    // Persistent session — broker re-delivers QoS 1 messages queued while offline
    clean: false,
  });

  client.on('connect', () => {
    console.log(`[MQTT] Connected to broker at ${url}`);
    // QoS 1 ensures readings are not dropped during transient network issues
    client.subscribe('aewis/devices/+/readings',  { qos: 1 });
    client.subscribe('aewis/devices/+/status',    { qos: 1 });
    client.subscribe('aewis/devices/+/provision', { qos: 1 });
  });

  client.on('reconnect', () => {
    console.log('[MQTT] Reconnecting to broker…');
  });

  client.on('offline', () => {
    console.warn('[MQTT] Client offline — will retry');
  });

  client.on('error', (err) => {
    console.error('[MQTT] Client error:', err.message);
  });

  return client;
}

// Publish a command packet to a subscribed device (e.g. OTA, reset, wifi)
function publish(topic, payload) {
  if (!client || !client.connected) return false;
  const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
  client.publish(topic, msg, { qos: 1, retain: false });
  return true;
}

function getBroker() { return client; }

module.exports = { startBroker, getBroker, publish };

const mqtt = require('mqtt');

let client = null;

function startBroker() {
  const url = process.env.MQTT_URL || 'mqtt://localhost:1883';
  const username = process.env.MQTT_USER;
  const password = process.env.MQTT_PASSWORD;

  client = mqtt.connect(url, {
    username,
    password,
    clientId: `aewis-backend-${Math.random().toString(16).slice(2, 8)}`,
  });

  client.on('connect', () => {
    console.log(`Connected to external MQTT broker at ${url}`);
    // Subscribe to all device readings, status, and provision topics
    client.subscribe('aewis/devices/+/readings', { qos: 0 });
    client.subscribe('aewis/devices/+/status', { qos: 0 });
    client.subscribe('aewis/devices/+/provision', { qos: 0 });
  });

  client.on('error', (err) => {
    console.error('MQTT client error:', err.message);
  });

  return client;
}

// Publish a command packet to a subscribed device (e.g. OTA, reset, wifi)
function publish(topic, payload) {
  if (!client || !client.connected) return false;
  const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
  client.publish(topic, msg, { qos: 0, retain: false });
  return true;
}

function getBroker() { return client; }

module.exports = { startBroker, getBroker, publish };

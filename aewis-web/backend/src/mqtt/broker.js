const { Aedes } = require('aedes');
const net        = require('net');

let aedes     = null;
let tcpServer = null;

function startBroker() {
  aedes = new Aedes();

  const port = parseInt(process.env.MQTT_PORT || '1883');
  tcpServer = net.createServer(aedes.handle);

  tcpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`MQTT port ${port} already in use — stop Mosquitto or other MQTT broker first.`);
      console.error('Run:  npx kill-port 1883   or stop the Mosquitto service.');
    } else {
      console.error('MQTT TCP server error:', err.message);
    }
    process.exit(1);
  });

  tcpServer.listen(port, '0.0.0.0', () => {
    console.log(`MQTT broker (aedes) listening on port ${port}`);
  });

  aedes.on('client', (client) => {
    console.log(`MQTT client connected: ${client.id}`);
  });

  aedes.on('clientDisconnect', (client) => {
    console.log(`MQTT client disconnected: ${client.id}`);
  });

  aedes.on('error', (err) => {
    console.error('MQTT broker error:', err.message);
  });

  return aedes;
}

// Publish a command packet to a subscribed device (e.g. OTA, reset, wifi)
function publish(topic, payload) {
  if (!aedes) return false;
  const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
  aedes.publish(
    { cmd: 'publish', qos: 0, topic, payload: Buffer.from(msg), retain: false },
    () => {}
  );
  return true;
}

function getBroker() { return aedes; }

module.exports = { startBroker, getBroker, publish };

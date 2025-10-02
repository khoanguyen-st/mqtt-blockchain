#!/usr/bin/env node
const mqtt = require("mqtt");

const argv = parseArgs(process.argv.slice(2));
const host = process.env.MQTT_HOST || "mqtt://localhost:1883";
const topic = argv.topic || "mqtt/things/demo/device1";
const count = Number(argv.count || 10);
const interval = Number(argv.interval || 500);

const client = mqtt.connect(host, {
  clientId: "publisher_" + Math.random().toString(16).slice(2),
  username: process.env.MQTT_USER,
  password: process.env.MQTT_PASS,
  clean: true,
});

client.on("connect", async () => {
  console.log(
    `Connected to ${host}. Publishing ${count} messages to ${topic} ...`
  );
  for (let i = 1; i <= count; i++) {
    const payload = buildPayload(i);
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) console.error("Publish error:", err.message);
      else console.log(`Published message ${i}/${count}`);
    });
    await sleep(interval);
  }
  console.log("Done. Closing connection.");
  client.end();
});

client.on("error", (err) => {
  console.error("MQTT error:", err.message);
});

function buildPayload(seq) {
  const now = new Date().toISOString();
  const devEUI = process.env.DEVEUI || generateRandomDevEUI();

  // Generate random coordinates around Ho Chi Minh City area
  const baseLat = 10.952638;
  const baseLon = 106.720131;
  const latOffset = (Math.random() - 0.5) * 0.01; // ~1km radius
  const lonOffset = (Math.random() - 0.5) * 0.01;

  return {
    DevEUI_location: {
      DevEUI: devEUI,
      DevAddr: generateRandomDevAddr(),
      Lrcid: "00000233",
      NwGeolocAlgo: 2,
      NwGeolocAlgoUsed: 1,
      ModelCfg: `1:TPX_${generateUUID()}`,
      Time: now,
      DevLocTime: now,
      DevLAT: +(baseLat + latOffset).toFixed(6),
      DevLON: +(baseLon + lonOffset).toFixed(6),
      DevAlt: +(Math.random() * 50).toFixed(1), // 0-50m altitude
      DevLocRadius: +(3000 + Math.random() * 5000).toFixed(1), // 3-8km radius
      DevAltRadius: 0.0,
      DevUlFCntUpUsed: 300 + seq, // Incrementing frame counter
      DevLocDilution: +(5 + Math.random() * 10).toFixed(1), // 5-15 dilution
      DevAltDilution: 0.0,
      DevNorthVel: +((Math.random() - 0.5) * 2).toFixed(1), // -1 to 1 m/s
      DevEastVel: +((Math.random() - 0.5) * 2).toFixed(1),
      CustomerID: process.env.CUSTOMER_ID || "1100012639",
      CustomerData: {
        loc: null,
        alr: {
          pro: "MILE/UC100",
          ver: "1",
        },
        tags: ["Nedspice"],
        doms: [
          {
            n: "VEEP/Vietnam/Nedspice",
            g: "VEEP",
          },
        ],
        name: `UC100-Nedspice No.${Math.floor(Math.random() * 100) + 1}`,
      },
      downlinkUrl: `https://thingparkenterprise.au.actility.com/iot-flow/downlinkMessages/${generateUUID()}`,
    },
  };
}

function generateRandomDevEUI() {
  return Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  ).join("");
}

function generateRandomDevAddr() {
  return Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  )
    .join("")
    .toUpperCase();
}

function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function parseArgs(args) {
  const out = {};
  for (const a of args) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const mqtt = require("mqtt");

// Thông tin broker
const host = "";
const username = "";
const password = "";

// Kết nối MQTT
const client = mqtt.connect(host, {
  clientId: "NodeClient_" + Math.random().toString(16).substr(2, 8),
  username,
  password,
  clean: true,
});

// Lưu dữ liệu theo DevEUI
const deviceBuffers = {};

// Khi kết nối thành công
client.on("connect", () => {
  console.log(`✅ Connected to MQTT broker at ${host}`);

  // Subscribe topic (dùng # để nhận tất cả devices)
  client.subscribe("mqtt/things/#", { qos: 1 }, (err, granted) => {
    if (err) return console.error("❌ Subscribe error:", err);
    console.log(
      "✅ Subscribed to topics:",
      granted.map((g) => g.topic).join(", ")
    );
  });
});

// Khi có message mới
client.on("message", (topic, message) => {
  try {
    const msgObj = JSON.parse(message.toString());
    const devEUI = msgObj.DevEUI_location?.DevEUI;

    if (!devEUI) return; // Không hiển thị nếu không có DevEUI

    if (!deviceBuffers[devEUI]) deviceBuffers[devEUI] = [];

    // Lưu message vào buffer
    deviceBuffers[devEUI].push(msgObj);

    // Chỉ log số lượng message đã nhận cho DevEUI
    console.log(
      `📩 DevEUI=${devEUI} | Received messages=${deviceBuffers[devEUI].length}`
    );

    // Nếu muốn hiển thị khi đủ 10 message, có thể thêm:
    if (deviceBuffers[devEUI].length >= 10) {
      console.log(`✅ DevEUI=${devEUI} đã nhận đủ 10 message`);
      // Xoá buffer nếu muốn tiếp tục nhận
      deviceBuffers[devEUI] = [];
    }
  } catch (err) {
    // Nếu parse lỗi, vẫn không hiển thị giá trị
    console.error("❌ Failed to parse message:", err);
  }
});

// Xử lý lỗi
client.on("error", (err) => {
  console.error("❌ Connection error:", err);
  client.end();
});

client.on("close", () => console.log("🔌 Disconnected from broker"));

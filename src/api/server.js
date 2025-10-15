const express = require("express");
const path = require("path");
const cfg = require("../config");
const logger = require("../utils/logger");
const metrics = require("../utils/metrics");

function createServer() {
  const app = express();
  app.use(express.json());

  // Serve static files (verification page)
  app.use("/public", express.static(path.join(__dirname, "public")));

  // Redirect /verify to verification page
  app.get("/verify", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "verify.html"));
  });

  app.get("/metrics", async (req, res) => {
    res.set("Content-Type", metrics.register.contentType);
    res.end(await metrics.register.metrics());
  });

  app.use("/health", require("./routes/health"));
  app.use("/api/v1/batches", require("./routes/batches"));
  app.use("/api/v1/messages", require("./routes/messages"));
  app.use("/api/v1/blockchain", require("./routes/blockchain"));
  app.use("/api/v1/assets", require("./routes/assets")); // Layer 1: Asset metadata

  // Error handler
  app.use((err, req, res, next) => {
    logger.error({ msg: "API error", err: err.message });
    res.status(500).json({ error: "Internal Server Error" });
  });

  const server = app.listen(cfg.api.port, () => {
    logger.info({ msg: "API listening", port: cfg.api.port });
  });
  return { app, server };
}

module.exports = { createServer };

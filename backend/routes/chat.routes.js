const express = require("express");
const chatController = require("../controllers/chat.controller");
const voiceController = require("../controllers/voice.controller");

const router = express.Router();
router.post("/transcribe", express.raw({ type: "audio/*", limit: "8mb" }), voiceController.transcribe);
router.post("/speech", voiceController.speak);
router.post("/", chatController.ask);

module.exports = router;

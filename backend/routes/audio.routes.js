const express = require("express");
const audioController = require("../controllers/audio.controller");

const router = express.Router();

router.post("/generate", audioController.generateAudio);
router.get("/files/:cacheKey", audioController.getAudioFile);

module.exports = router;

const express = require("express");
const digestController = require("../controllers/digest.controller");

const router = express.Router();

router.get("/announcements", digestController.discoverAnnouncements);
router.post("/build", digestController.startBuild);
router.post("/audio-intros/build", digestController.startAudioIntroBuild);
router.post("/summaries/regenerate", digestController.startSummaryRegeneration);
router.get("/jobs/:jobId", digestController.getJob);
router.get("/latest", digestController.getLatestDigest);

module.exports = router;

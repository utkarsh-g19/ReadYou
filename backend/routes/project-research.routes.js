const express = require("express");
const projectResearchController = require("../controllers/project-research.controller");

const router = express.Router();

router.post("/audio-intro", projectResearchController.generateAudioIntro);
router.post("/", projectResearchController.researchSubmission);

module.exports = router;

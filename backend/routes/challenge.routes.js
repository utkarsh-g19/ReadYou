const express = require("express");
const challengeController = require("../controllers/challenge.controller");

const router = express.Router();

router.get("/dev-articles", challengeController.getDevTeamArticles);

module.exports = router;

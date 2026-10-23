const express = require("express");
const winnerController = require("../controllers/winner.controller");

const router = express.Router();

router.get("/:articleId", winnerController.getWinners);

module.exports = router;

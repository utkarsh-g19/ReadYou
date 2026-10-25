require("dotenv").config();
const challengeRoutes = require("./routes/challenge.routes");
const winnerRoutes = require("./routes/winner.routes");
const projectResearchRoutes = require("./routes/project-research.routes");
const digestRoutes = require("./routes/digest.routes");
const audioRoutes = require("./routes/audio.routes");
const chatRoutes = require("./routes/chat.routes");
const { startDigestScheduler } = require("./services/digest-scheduler.service");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "32kb" }));
app.use("/api/challenges", challengeRoutes);
app.use("/api/winners", winnerRoutes);
app.use("/api/project-research", projectResearchRoutes);
app.use("/api/digests", digestRoutes);
app.use("/api/audio", audioRoutes);
app.use("/api/chat", chatRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "ReadYou backend is running",
  });
});

app.listen(PORT, () => {
  console.log(`ReadYou server running at http://localhost:${PORT}`);

  startDigestScheduler();
});

const digestService = require("../services/digest.service");

async function discoverAnnouncements(req, res) {
  try {
    const announcements = await digestService.discoverWinnerAnnouncements();

    return res.json({
      success: true,
      count: announcements.length,
      announcements,
    });
  } catch (error) {
    console.error("Winner announcement discovery failed:", error.message);

    return res.status(502).json({
      success: false,
      message: "Could not discover winner announcements from DEV.",
    });
  }
}

async function startBuild(req, res) {
  try {
    const result = await digestService.startBuild();

    return res.status(202).json({
      success: true,
      alreadyRunning: result.alreadyRunning,
      message: result.alreadyRunning
        ? "A digest build is already running."
        : "Digest build started.",
      job: result.job,
    });
  } catch (error) {
    console.error("Could not start digest build:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not start the digest build.",
    });
  }
}

async function startAudioIntroBuild(req, res) {
  try {
    const result = await digestService.startAudioIntroBuild();

    return res.status(202).json({
      success: true,
      alreadyRunning: result.alreadyRunning,
      message: result.alreadyRunning
        ? "An audio-intro job is already running."
        : "Audio-intro generation started.",
      job: result.job,
    });
  } catch (error) {
    console.error("Could not start audio-intro generation:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not start audio-intro generation.",
    });
  }
}

function getJob(req, res) {
  const job = digestService.getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      message: "Digest job not found.",
    });
  }

  return res.json({ success: true, job });
}

async function getLatestDigest(req, res) {
  try {
    const digest = await digestService.getLatestDigest();

    if (!digest) {
      return res.status(404).json({
        success: false,
        message: "No digest has been generated yet.",
      });
    }

    return res.json({ success: true, digest });
  } catch (error) {
    console.error("Could not read latest digest:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not read the latest digest.",
    });
  }
}

module.exports = {
  discoverAnnouncements,
  startBuild,
  startAudioIntroBuild,
  getJob,
  getLatestDigest,
};

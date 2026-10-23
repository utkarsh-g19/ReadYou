const digestService = require("../services/digest.service");
const elevenLabsService = require("../services/elevenlabs.service");

async function generateAudio(req, res) {
  try {
    const { submissionUrl } = req.body || {};

    if (typeof submissionUrl !== "string" || !submissionUrl.trim()) {
      return res.status(400).json({
        success: false,
        message: "A submission URL is required.",
      });
    }

    // Only generate audio for a winner already present in our digest.
    const digest = await digestService.getLatestDigest();

    if (!digest) {
      return res.status(404).json({
        success: false,
        message: "No saved digest is available.",
      });
    }

    let selectedWinner = null;

    for (const announcement of digest.announcements || []) {
      selectedWinner = (announcement.winners || []).find(
        (winner) => winner.submissionUrl === submissionUrl.trim(),
      );

      if (selectedWinner) break;
    }

    if (!selectedWinner) {
      return res.status(404).json({
        success: false,
        message: "This submission was not found in the saved digest.",
      });
    }

    if (
      selectedWinner.status !== "completed" ||
      typeof selectedWinner.audioIntro !== "string" ||
      !selectedWinner.audioIntro.trim()
    ) {
      return res.status(422).json({
        success: false,
        message: "This project does not have a completed audio introduction.",
      });
    }

    const result = await elevenLabsService.generateOrGetAudio(
      selectedWinner.submissionUrl,
      selectedWinner.audioIntro,
    );

    return res.json({
      success: true,
      cached: result.cached,
      audioUrl: `/api/audio/files/${result.cacheKey}`,
    });
  } catch (error) {
    console.error("ElevenLabs audio generation failed:", error.message);

    return res.status(502).json({
      success: false,
      message: error.message || "Audio generation failed.",
    });
  }
}

async function getAudioFile(req, res) {
  try {
    const audioPath = await elevenLabsService.getCachedAudioPath(
      req.params.cacheKey,
    );

    if (!audioPath) {
      return res.status(404).json({
        success: false,
        message: "Cached audio file not found.",
      });
    }

    res.set("Cache-Control", "public, max-age=31536000, immutable");

    return res.sendFile(audioPath, (error) => {
      if (error) {
        console.error("Could not serve cached audio:", error.message);

        if (!res.headersSent) {
          res.status(500).end();
        }
      }
    });
  } catch (error) {
    console.error("Could not read cached audio:", error.message);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Could not read the audio file.",
      });
    }
  }
}

module.exports = {
  generateAudio,
  getAudioFile,
};

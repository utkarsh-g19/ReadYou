const projectResearchService = require("../services/project-research.service");
const ollamaService = require("../services/ollama.service");
async function researchSubmission(req, res) {
  try {
    const { url } = req.body;

    if (typeof url !== "string" || !url.trim()) {
      return res.status(400).json({
        success: false,
        message: "A submission URL is required.",
      });
    }

    const project = await projectResearchService.getSubmissionByUrl(url.trim());
    const summary = await ollamaService.generateSummary(project);
    res.json({
      success: true,
      project,
      summary,
    });
  } catch (error) {
    console.error("Project research failed:", error);

    res.status(502).json({
      success: false,
      message: "Failed to retrieve the project submission.",
    });
  }
}

async function generateAudioIntro(req, res) {
  try {
    const { url, summary = "" } = req.body;

    if (typeof url !== "string" || !url.trim()) {
      return res.status(400).json({
        success: false,
        message: "A submission URL is required.",
      });
    }

    const project = await projectResearchService.getSubmissionByUrl(url.trim());

    const audioIntro = await ollamaService.generateAudioIntro(
      project,
      typeof summary === "string" ? summary : "",
    );

    return res.json({
      success: true,
      project: {
        title: project.title,
        author: project.author,
        url: project.url,
      },
      audioIntro,
    });
  } catch (error) {
    console.error("Audio intro generation failed:", error.message);

    return res.status(502).json({
      success: false,
      message: error.message || "Could not generate the audio introduction.",
    });
  }
}

module.exports = {
  researchSubmission,
  generateAudioIntro,
};

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

module.exports = {
  researchSubmission,
};

const devApiService = require("../services/dev-api.service");
const winnerExtractor = require("../services/winner-extractor.service");

async function getWinners(req, res) {
  try {
    const articleId = Number(req.params.articleId);

    if (!Number.isSafeInteger(articleId) || articleId <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid article ID is required.",
      });
    }

    const article = await devApiService.getArticleById(articleId);

    if (!article.body_markdown) {
      return res.status(422).json({
        success: false,
        message: "The article does not contain Markdown content.",
      });
    }

    const winners = winnerExtractor.extractWinners(article.body_markdown);

    res.json({
      success: true,
      announcement: {
        title: article.title,
        url: article.url,
      },
      count: winners.length,
      winners,
    });
  } catch (error) {
    console.error("Winner extraction failed:", error.message);

    res.status(502).json({
      success: false,
      message: "Could not retrieve or process the announcement.",
    });
  }
}

module.exports = {
  getWinners,
};

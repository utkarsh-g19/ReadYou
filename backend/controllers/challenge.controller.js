const devApiService = require("../services/dev-api.service");

async function getDevTeamArticles(req, res) {
  try {
    const articles = await devApiService.getArticlesByUsername("devteam", 100);

    const matchingArticles = articles
      .filter((article) => /hacktoberfest|winner/i.test(article.title))
      .map((article) => ({
        id: article.id,
        title: article.title,
        url: article.url,
        publishedAt: article.published_at,
      }));

    res.json({
      success: true,
      count: matchingArticles.length,
      articles: matchingArticles,
    });
  } catch (error) {
    console.error("Failed to retrieve DEV articles:", error.message);

    res.status(502).json({
      success: false,
      message: "Failed to retrieve articles from DEV.",
    });
  }
}

module.exports = {
  getDevTeamArticles,
};

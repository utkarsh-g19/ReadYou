const devApiService = require("./dev-api.service");
const githubService = require("./github.service");
async function getSubmissionByUrl(submissionUrl) {
  const parsedUrl = new URL(submissionUrl);

  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== "dev.to") {
    throw new Error("Only valid DEV.to submission URLs are supported.");
  }

  const pathParts = parsedUrl.pathname.split("/").filter(Boolean);

  if (pathParts.length < 2) {
    throw new Error("Invalid DEV article URL.");
  }

  const username = pathParts[0];
  const slug = pathParts[pathParts.length - 1];

  const article = await devApiService.getArticleByPath(username, slug);
  const markdown = article.body_markdown || "";

  const githubLinks = [
    ...new Set(
      [...markdown.matchAll(/https?:\/\/github\.com\/[^\s)>\]]+/gi)]
        .map(([url]) => url.replace(/[.,;]+$/, ""))
        .map((url) => {
          const parsed = new URL(url);
          const parts = parsed.pathname.split("/").filter(Boolean);

          if (parts.length < 2) return null;

          return `https://github.com/${parts[0]}/${parts[1]}`;
        })
        .filter(Boolean),
    ),
  ];

  const repositories = [];

  for (const githubUrl of githubLinks.slice(0, 5)) {
    try {
      const repository = await githubService.getRepositoryReadme(githubUrl);

      repositories.push(repository);
    } catch (error) {
      console.error(
        `Could not retrieve README for ${githubUrl}:`,
        error.message,
      );
    }
  }

  return {
    title: article.title,
    url: article.url,
    description: article.description || "",
    author: article.user?.name || article.user?.username || "Unknown",
    publishedAt: article.published_at,
    markdown,
    githubLinks,
    repositories,
  };
}

module.exports = {
  getSubmissionByUrl,
};

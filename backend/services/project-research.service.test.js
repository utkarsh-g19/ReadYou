const test = require("node:test");
const assert = require("node:assert/strict");

const devApiService = require("./dev-api.service");
const githubService = require("./github.service");
const projectResearchService = require("./project-research.service");

test("chat article-only research avoids sequential GitHub README and Ollama checks", async () => {
  const originalGetArticle = devApiService.getArticleByPath;
  const originalGetReadme = githubService.getRepositoryReadme;
  let githubCalls = 0;
  devApiService.getArticleByPath = async () => ({
    title: "Fast Article Source",
    url: "https://dev.to/author/fast-article-abc",
    description: "A useful project description.",
    body_markdown: "# Overview\nArticle source for chat.",
    user: { name: "Author" },
  });
  githubService.getRepositoryReadme = async () => {
    githubCalls += 1;
    throw new Error("Should not fetch GitHub for the chat fast path.");
  };

  try {
    const article = await projectResearchService.getSubmissionArticleByUrl(
      "https://dev.to/author/fast-article-abc",
    );
    assert.equal(article.markdown, "# Overview\nArticle source for chat.");
    assert.equal(article.description, "A useful project description.");
    assert.equal(githubCalls, 0);
  } finally {
    devApiService.getArticleByPath = originalGetArticle;
    githubService.getRepositoryReadme = originalGetReadme;
  }
});

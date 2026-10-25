const devApiService = require("./dev-api.service");
const githubService = require("./github.service");
const repositoryRelevanceService = require("./repository-relevance.service");
const cheerio = require("cheerio");

async function getArticleWithCanonicalFallback(username, slug, submissionUrl) {
  try {
    return await devApiService.getArticleByPath(username, slug);
  } catch (error) {
    // Only attempt fallback when the original DEV API path returns 404.
    if (!/\b404\b/.test(error.message)) {
      throw error;
    }

    // Follow redirects and inspect the article's canonical URL.
    const response = await fetch(submissionUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "ReadYou/0.1",
      },
    });

    if (!response.ok) {
      throw error;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const canonicalHref =
      $('link[rel="canonical"]').attr("href") || response.url;

    const canonicalUrl = new URL(canonicalHref, response.url);

    if (
      canonicalUrl.protocol !== "https:" ||
      canonicalUrl.hostname !== "dev.to"
    ) {
      throw error;
    }

    const parts = canonicalUrl.pathname.split("/").filter(Boolean);

    if (parts.length < 2) {
      throw error;
    }

    const canonicalUsername = parts[0];
    const canonicalSlug = parts[parts.length - 1];

    // Don't retry the same invalid API path.
    if (canonicalUsername === username && canonicalSlug === slug) {
      throw error;
    }

    console.log(`DEV username changed: ${username} -> ${canonicalUsername}`);

    return devApiService.getArticleByPath(canonicalUsername, canonicalSlug);
  }
}

async function getSubmissionArticleByUrl(submissionUrl) {
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

  const article = await getArticleWithCanonicalFallback(
    username,
    slug,
    submissionUrl,
  );
  return {
    title: article.title,
    url: article.url,
    description: article.description || "",
    author: article.user?.name || article.user?.username || "Unknown",
    publishedAt: article.published_at,
    markdown: article.body_markdown || "",
  };
}

async function getSubmissionByUrl(submissionUrl) {
  const project = await getSubmissionArticleByUrl(submissionUrl);
  const markdown = project.markdown;

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

  const candidates = [];

  for (const githubUrl of githubLinks.slice(0, 5)) {
    try {
      const repository = await githubService.getRepositoryReadme(githubUrl);

      candidates.push(repository);
    } catch (error) {
      console.error(
        `Could not retrieve README for ${githubUrl}:`,
        error.message,
      );
    }
  }

  const submission = {
    ...project,
    markdown,
    githubLinks,
  };
  const repositories = await repositoryRelevanceService.selectRelevantRepositories(
    submission,
    candidates,
  );

  return {
    ...submission,
    repositories,
  };
}

module.exports = {
  getSubmissionByUrl,
  getSubmissionArticleByUrl,
};

const DEV_API_BASE_URL = process.env.DEV_API_BASE_URL || "https://dev.to/api";

async function getArticlesByUsername(username, perPage = 100) {
  const url = new URL(`${DEV_API_BASE_URL}/articles`);

  url.searchParams.set("username", username);
  url.searchParams.set("per_page", perPage);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "ReadYou/0.1",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `DEV API request failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}
async function getArticleById(articleId) {
  const response = await fetch(`${DEV_API_BASE_URL}/articles/${articleId}`, {
    headers: {
      "User-Agent": "ReadYou/0.1",
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`DEV API request failed: ${response.status}`);
  }

  return response.json();
}
async function getArticleBySlug(slug) {
  const response = await fetch(
    `${DEV_API_BASE_URL}/articles/${encodeURIComponent(slug)}`,
    {
      headers: {
        "User-Agent": "ReadYou/0.1",
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`DEV article lookup failed: ${response.status}`);
  }

  return response.json();
}
async function getArticleByPath(username, slug) {
  const response = await fetch(
    `${DEV_API_BASE_URL}/articles/${encodeURIComponent(username)}/${encodeURIComponent(slug)}`,
    {
      headers: {
        "User-Agent": "ReadYou/0.1",
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `DEV article lookup failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}
module.exports = {
  getArticlesByUsername,
  getArticleById,
  getArticleBySlug,
  getArticleByPath,
};

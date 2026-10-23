async function getRepositoryReadme(repositoryUrl) {
  const parsedUrl = new URL(repositoryUrl);

  if (parsedUrl.hostname !== "github.com" || parsedUrl.protocol !== "https:") {
    throw new Error("Invalid GitHub repository URL.");
  }

  const parts = parsedUrl.pathname.split("/").filter(Boolean);

  if (parts.length < 2) {
    throw new Error("Could not identify the GitHub repository.");
  }

  const [owner, repo] = parts;

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
    {
      headers: {
        Accept: "application/vnd.github.raw+json",
        "User-Agent": "ReadYou/0.1",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub README request failed: ${response.status}`);
  }

  return {
    repositoryUrl: `https://github.com/${owner}/${repo}`,
    readme: await response.text(),
  };
}

module.exports = {
  getRepositoryReadme,
};

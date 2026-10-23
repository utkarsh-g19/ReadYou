const githubService = require("./services/github.service");

async function main() {
  const result = await githubService.getRepositoryReadme(
    "https://github.com/octokit/octokit.rb",
  );

  console.log("Repository:", result.repositoryUrl);
  console.log("README preview:\n");
  console.log(result.readme.slice(0, 1000));
}

main().catch(console.error);

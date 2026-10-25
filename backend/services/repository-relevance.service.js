const ollamaService = require("./ollama.service");

const MAX_REPOSITORIES = 5;

async function selectRelevantRepositories(
  project,
  candidates,
  classify = ollamaService.classifyRepositoryRelevance,
) {
  const selected = [];

  for (const candidate of candidates.slice(0, MAX_REPOSITORIES)) {
    try {
      if (await classify(project, candidate)) {
        selected.push(candidate);
      }
    } catch (error) {
      // A failed/uncertain classification must never add source material.
      console.warn(
        `Could not verify repository relevance for ${candidate.repositoryUrl}:`,
        error.message,
      );
    }
  }

  return selected;
}

module.exports = { selectRelevantRepositories };

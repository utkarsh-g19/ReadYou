const BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";

async function generateSummary(project) {
  const repos = (project.repositories || [])
    .map(
      (r) => "Repository: " + r.repositoryUrl + "\n" + r.readme.slice(0, 4000),
    )
    .join("\n\n");

  const prompt = [
    "You are ReadYou, an open-source project summarizer.",
    "Summarize ONLY the project identified below. Ignore unrelated library documentation and code examples.",
    "Use 100-150 words. No introduction, conclusion, or marketing language.",
    "Use exactly these six headings, in this order:",
    "## The Idea",
    "## Problem & Solution",
    "## Challenges & Solutions",
    "## Tech Stack",
    "## Workflow",
    "## Limitations",
    "Never invent facts. Include only documented challenges and solutions.",
    "If challenges are not documented, say so briefly.",
    "Explain the workflow in 3-5 short steps.",
    "List technologies used by this project, not unrelated examples.",
    "Label uncertain concerns as potential limitations.",
    "Return only the six-section briefing.",
    "",
    "PROJECT: " + project.title,
    "AUTHOR: " + project.author,
    "SUBMISSION URL: " + project.url,
    "DESCRIPTION: " + (project.description || "Not provided"),
    "",
    "SUBMISSION CONTENT:",
    (project.markdown || "").slice(0, 2500),
    "",
    "REPOSITORY DOCUMENTATION:",
    repos || "No repository README available.",
  ].join("\n");

  const response = await fetch(BASE_URL + "/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt: prompt,
      stream: false,
      options: {
        temperature: 0.2,
        num_predict: 1200,
      },
      think: false,
    }),
  });

  if (!response.ok) {
    throw new Error("Ollama request failed: " + response.status);
  }

  const data = await response.json();
  console.log("Ollama model:", data.model);
  console.log("Ollama done reason:", data.done_reason);
  console.log("Ollama response length:", data.response?.length);
  console.log("Ollama raw response:", JSON.stringify(data));
  if (!data.response || !data.response.trim()) {
    throw new Error("Ollama returned an empty summary.");
  }

  return data.response.trim();
}

module.exports = { generateSummary };

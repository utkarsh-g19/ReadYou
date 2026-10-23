const BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "gemma4:e2b";

async function generateText(prompt, options = {}) {
  const response = await fetch(`${BASE_URL}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.2,
        num_predict: options.numPredict ?? 1200,
      },
      think: false,
    }),
  });

  if (!response.ok) {
    const details = await response.text();

    throw new Error(
      `Ollama request failed (${response.status}): ${details.slice(0, 300)}`,
    );
  }

  const data = await response.json();
  const result = data.response?.trim();

  if (!result) {
    throw new Error("Ollama returned an empty response.");
  }

  return result;
}

async function generateSummary(project) {
  const repos = (project.repositories || [])
    .map(
      (repository) =>
        `Repository: ${repository.repositoryUrl}\n${(repository.readme || "").slice(0, 4000)}`,
    )
    .join("\n\n");

  const prompt = [
    "You are ReadYou's technical analyst.",
    "Explain real open-source projects clearly to developers who want to understand how they work.",
    "",
    "OBJECTIVE:",
    "Write a useful, specific, evidence-grounded technical briefing about this project.",
    "Prioritize what is distinctive about the implementation over generic descriptions.",
    "",
    "SOURCE RULES:",
    "Use the project submission and supplied README documentation as factual sources.",
    "Never invent technologies, features, APIs, challenges, solutions, results, benchmarks, or architecture.",
    "A technology mentioned in unrelated README examples is not necessarily used by this project.",
    "If information is missing, explicitly say it is not documented rather than guessing.",
    "Distinguish verified limitations from potential limitations.",
    "",
    "Write approximately 150-200 words. Be specific, concise, readable, and non-promotional.",
    "Return exactly these six Markdown headings in this order:",
    "",
    "## The Idea",
    "Explain what the project does, who it helps, and its distinctive feature.",
    "",
    "## Problem & Solution",
    "Describe the problem and how the project addresses it, based on the sources.",
    "",
    "## Challenges & Solutions",
    "Explain documented implementation challenges and solutions.",
    "If none are documented, state that. Never manufacture a challenge.",
    "",
    "## Tech Stack",
    "List only technologies confirmed by the project sources and their documented roles.",
    "",
    "## Workflow",
    "Explain the actual process in 2-4 ordered steps, using documented inputs and outputs.",
    "",
    "## Limitations",
    "Report acknowledged limitations. Label reasonable but unverified concerns as potential limitations.",
    "Do not assume a feature is absent simply because it is not documented.",
    "",
    "FINAL CHECK:",
    "Every specific technical claim must be supported by the supplied evidence.",
    "Return only the six-section briefing.",
    "",
    `PROJECT: ${project.title}`,
    `AUTHOR: ${project.author || "Unknown"}`,
    `SUBMISSION URL: ${project.url}`,
    `DESCRIPTION: ${project.description || "Not provided"}`,
    "",
    "SUBMISSION CONTENT:",
    (project.markdown || "").slice(0, 3500),
    "",
    "REPOSITORY DOCUMENTATION:",
    repos || "No repository README available.",
  ].join("\n");

  return generateText(prompt, {
    temperature: 0.2,
    numPredict: 1400,
  });
}

async function generateAudioIntro(project, technicalSummary = "") {
  const repos = (project.repositories || [])
    .slice(0, 2)
    .map(
      (repository) =>
        `Repository: ${repository.repositoryUrl}\n${(repository.readme || "").slice(0, 1200)}`,
    )
    .join("\n\n");

  const prompt = [
    "You are the friendly audio storyteller for ReadYou, a product that helps people discover interesting open-source projects.",
    "",
    "YOUR TASK:",
    "Write a short, engaging spoken introduction to this specific project.",
    "Imagine telling a curious friend about a clever idea you just discovered.",
    "",
    "STYLE:",
    "Use natural, relaxed, conversational English.",
    "Talk directly to the listener when it feels natural.",
    "Start with a relatable everyday frustration, a vivid scenario, an intriguing question,",
    "a surprising observation, or a playful insight that genuinely fits this project.",
    "Then reveal the project's solution naturally and explain why it is interesting.",
    "Use varied openings across different projects. Do not always begin with the same phrase.",
    "Do not default to 'Meet [project name]' or generic introductions such as 'In today's world'.",
    "Sound like a thoughtful, tech-savvy friend, not a corporate narrator or a news anchor.",
    "",
    "FACTUAL ACCURACY:",
    "Use only the supplied project information and technical briefing.",
    "The opening hook must be relevant to the documented use case.",
    "Never invent user problems, capabilities, features, outcomes, or technical details.",
    "Do not exaggerate what the project can do.",
    "If its value is not completely clear from the sources, use a curiosity-led introduction instead of guessing.",
    "",
    "LENGTH AND FORMAT:",
    "Write 45-70 words, suitable for roughly 20-35 seconds of speech.",
    "Mention the project name naturally.",
    "Focus on one problem, the solution, and one interesting benefit or feature.",
    "Use simple words and natural sentence rhythm.",
    "No headings, bullet points, stage directions, emojis, citations, or quotation marks.",
    "Return only the spoken introduction.",
    "",
    `PROJECT: ${project.title}`,
    `AUTHOR: ${project.author || "Unknown"}`,
    `SUBMISSION URL: ${project.url || "Not provided"}`,
    `DESCRIPTION: ${project.description || "Not provided"}`,
    "",
    "EXISTING TECHNICAL BRIEFING:",
    technicalSummary || "Not available.",
    "",
    "ORIGINAL SUBMISSION CONTENT:",
    (project.markdown || "").slice(0, 3500),
    "",
    "REPOSITORY DOCUMENTATION:",
    repos || "No repository README available.",
  ].join("\n");

  const intro = await generateText(prompt, {
    temperature: 0.75,
    numPredict: 180,
  });

  return intro
    .replace(/^["“]|["”]$/g, "")
    .replace(/^(?:Audio introduction|Introduction)\s*:\s*/i, "")
    .trim();
}

module.exports = {
  generateSummary,
  generateAudioIntro,
};

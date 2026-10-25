const test = require("node:test");
const assert = require("node:assert/strict");
const { createChatService, UNKNOWN_ANSWER, OUT_OF_SCOPE_ANSWER, buildSources, selectRelevantSources } = require("./chat.service");
const { validateChatPayload } = require("../controllers/chat.controller");

const projectAUrl = "https://dev.to/alice/project-a-123";
const projectBUrl = "https://dev.to/bob/project-b-456";
const projectA = {
  projectId: projectAUrl,
  submissionUrl: projectAUrl,
  title: "Project A",
  description: "A field notebook.",
  markdown: "# Purpose\nA pocket field notebook for hikers.\n# Workflow\nIt stores notes offline.",
  repositories: [
    {
      repositoryUrl: "https://github.com/alice/project-a",
      readme: "# Project A\nThe app stores field notes in a local SQLite database.",
    },
  ],
};

function serviceWith({ project = projectA, answer, recoveryAnswer = '{"claims":[]}', resolve, onPrompt, onRecoveryPrompt } = {}) {
  return createChatService({
    resolveProjectSources: resolve || (async (id) => id === project.projectId ? project : null),
    generateAnswer: async (prompt) => {
      onPrompt?.(prompt);
      return typeof answer === "function" ? answer(prompt) : answer;
    },
    generateRecoveryAnswer: async (prompt) => {
      onRecoveryPrompt?.(prompt);
      return typeof recoveryAnswer === "function" ? recoveryAnswer(prompt) : recoveryAnswer;
    },
  });
}

test("returns the documented uncertainty when the source set has no answer", async () => {
  const service = serviceWith({ answer: '{"claims":[]}' });
  const result = await service.ask({ projectId: projectAUrl, question: "Who funded it?" });
  assert.match(result.answer, /can't find|couldn't put that together/i);
  assert.deepEqual(result.citations, []);
});

test("lets the model recognize a casually formatted project question semantically", async () => {
  let prompt = "";
  const service = serviceWith({
    onPrompt: (value) => { prompt = value; },
    answer: JSON.stringify({ questionAssessment: { projectRelated: true }, claims: [{
      text: "It is a pocket field notebook for hikers, and it can save notes offline.",
      evidence: [{ sourceId: "dev", heading: "Purpose", quote: "A pocket field notebook for hikers." }],
    }] }),
  });
  const result = await service.ask({ projectId: projectAUrl, question: "what is this project about???" });
  assert.match(prompt, /semantically, not by exact keywords, punctuation, spelling/i);
  assert.match(result.answer, /pocket field notebook/i);
  assert.deepEqual(result.citations, []);
});

test("uses the model's semantic scope decision for unrelated questions without a recovery guess", async () => {
  let recoveryCalls = 0;
  const service = createChatService({
    resolveProjectSources: async () => projectA,
    generateAnswer: async () => JSON.stringify({ questionAssessment: { projectRelated: false }, claims: [] }),
    generateRecoveryAnswer: async () => { recoveryCalls += 1; return '{"claims":[]}'; },
  });
  const result = await service.ask({ projectId: projectAUrl, question: "What's the weather in Delhi?" });
  assert.equal(result.answer, OUT_OF_SCOPE_ANSWER);
  assert.deepEqual(result.citations, []);
  assert.equal(recoveryCalls, 0);
});

test("keeps a related but undocumented question distinct from an unrelated question", async () => {
  const service = serviceWith({ answer: JSON.stringify({ questionAssessment: { projectRelated: true }, claims: [] }) });
  const result = await service.ask({ projectId: projectAUrl, question: "Who funded this project?" });
  assert.notEqual(result.answer, OUT_OF_SCOPE_ANSWER);
  assert.match(result.answer, /can't find/i);
  assert.deepEqual(result.citations, []);
});

test("fails closed when the model returns an invalid scope assessment", async () => {
  const service = serviceWith({ answer: JSON.stringify({ questionAssessment: { projectRelated: "maybe" }, claims: [{
    text: "Unsupported.",
    evidence: [{ sourceId: "dev", heading: "Purpose", quote: "A pocket field notebook for hikers." }],
  }] }) });
  const result = await service.ask({ projectId: projectAUrl, question: "what is this project about???" });
  assert.equal(result.answer, UNKNOWN_ANSWER);
});

test("uses the relevant cached README and returns its original repository URL", async () => {
  let prompt = "";
  const service = serviceWith({
    onPrompt: (value) => { prompt = value; },
    answer: JSON.stringify({ claims: [{
      text: "The app stores field notes in SQLite.",
      evidence: [{ sourceId: "repo-1", heading: "Project A", quote: "The app stores field notes in a local SQLite database." }],
    }] }),
  });
  const result = await service.ask({ projectId: projectAUrl, question: "How are notes stored?" });
  assert.match(prompt, /alice\/project-a/);
  assert.deepEqual(result.citations, [], "sources stay hidden unless requested");
});

test("shows source links only when asked, then reuses verified references for a sources follow-up", async () => {
  let calls = 0;
  const service = serviceWith({
    answer: JSON.stringify({ claims: [{
      text: "The app saves field notes in SQLite, which lets hikers keep them locally.",
      evidence: [{ sourceId: "repo-1", heading: "Project A", quote: "The app stores field notes in a local SQLite database." }],
    }] }),
    onPrompt: () => { calls += 1; },
  });
  const first = await service.ask({ projectId: projectAUrl, question: "How are the notes saved?" });
  assert.deepEqual(first.citations, []);
  const followUp = await service.ask({ projectId: projectAUrl, question: "sources?", sessionId: first.sessionId });
  assert.match(followUp.answer, /source passages/i);
  assert.equal(followUp.citations[0].url, "https://github.com/alice/project-a");
  assert.equal(followUp.citations[0].quote, "The app stores field notes in a local SQLite database.");
  assert.equal(calls, 1, "the source follow-up should not call the model again");
});

test("includes verified citations when the user requests sources with a new question", async () => {
  const service = serviceWith({ answer: JSON.stringify({ claims: [{
    text: "The project saves notes offline.",
    evidence: [{ sourceId: "dev", heading: "Workflow", quote: "It stores notes offline." }],
  }] }) });
  const result = await service.ask({ projectId: projectAUrl, question: "Does it work offline? Include sources." });
  assert.equal(result.citations[0].url, projectAUrl);
});

test("includes verified citations for the Voice Mentor without changing default chat citations", async () => {
  const service = serviceWith({ answer: JSON.stringify({ claims: [{
    text: "It stores notes offline.",
    evidence: [{ sourceId: "dev", heading: "Workflow", quote: "It stores notes offline." }],
  }] }) });
  const result = await service.ask({ projectId: projectAUrl, question: "How does it work?", includeSources: true });
  assert.equal(result.citations[0].url, projectAUrl);
});

test("accepts a canonical DEV author URL for the same cached submission slug", async () => {
  const canonicalProject = {
    ...projectA,
    submissionUrl: "https://dev.to/alice-canonical/project-a-123",
  };
  const service = serviceWith({
    project: canonicalProject,
    answer: JSON.stringify({ claims: [{
      text: "The article describes the project.",
      evidence: [{ sourceId: "dev", heading: "Purpose", quote: "A pocket field notebook for hikers." }],
    }] }),
  });
  const result = await service.ask({ projectId: projectAUrl, question: "What is this?" });
  assert.deepEqual(result.citations, []);
});

test("does not admit an invalid source ID and falls back to matching verified evidence", async () => {
  const service = serviceWith({ answer: JSON.stringify({ claims: [{
    text: "A claim based on an unrelated README.",
    evidence: [{ sourceId: "repo-9", heading: "Other project", quote: "This is a sufficiently long quote." }],
  }] }) });
  const result = await service.ask({ projectId: projectAUrl, question: "Does it use SQLite?" });
  assert.match(result.answer, /In “Project A”:/i);
  assert.match(result.answer, /SQLite/);
  assert.deepEqual(result.citations, []);
});

test("retries an unanswered simple workflow question in plain language before using a source excerpt", async () => {
  const project = {
    ...projectA,
    title: "StitchProof",
    markdown: "# Workflows\nStitchProof uses two workflows: a manual eval workflow (synthetic sets); it runs approaches C and D on Tinker with a hard spending cap of $3 per run, writes the results table into the job summary and uploads raw results as artifacts.",
    repositories: [],
  };
  let recoveryPrompt = "";
  const service = serviceWith({
    project,
    answer: '{"claims":[]}',
    recoveryAnswer: JSON.stringify({ claims: [{
      text: "It has a manual evaluation run that compares two approaches within a $3 budget, then saves a summary and raw results.",
      evidence: [{ sourceId: "dev", heading: "Workflows", quote: "it runs approaches C and D on Tinker with a hard spending cap of $3 per run, writes the results table into the job summary and uploads raw results as artifacts." }],
    }] }),
    onRecoveryPrompt: (prompt) => { recoveryPrompt = prompt; },
  });

  const result = await service.ask({
    projectId: projectAUrl,
    question: "Can you explain the workflow simply?",
    includeSources: true,
  });

  assert.match(recoveryPrompt, /plain, conversational language/i);
  assert.match(recoveryPrompt, /Can you explain the workflow simply\?/);
  assert.match(result.answer, /manual evaluation run.*two approaches/i);
  assert.doesNotMatch(result.answer, /couldn't put that together|relevant detail/i);
  assert.equal(result.citations[0].heading, "Workflows");
});

test("rejects fabricated section headings", async () => {
  const service = serviceWith({ answer: JSON.stringify({ claims: [{
    text: "Unsupported claim.",
    evidence: [{ sourceId: "dev", heading: "Imaginary Feature", quote: "A pocket field notebook for hikers." }],
  }] }) });
  const result = await service.ask({ projectId: projectAUrl, question: "What features?" });
  assert.match(result.answer, /can't find|couldn't put that together/i);
});

test("rejects quotes that do not appear verbatim in a source section", async () => {
  const service = serviceWith({ answer: JSON.stringify({ claims: [{
    text: "Unsupported claim.",
    evidence: [{ sourceId: "dev", heading: "Purpose", quote: "A pocket planner for mountain climbers." }],
  }] }) });
  const result = await service.ask({ projectId: projectAUrl, question: "What is it?" });
  assert.match(result.answer, /can't find|couldn't put that together/i);
  assert.deepEqual(result.citations, []);
});

test("returns uncertainty for malformed Ollama output", async () => {
  const service = serviceWith({ answer: "Here is the answer: probably a weather app." });
  const result = await service.ask({ projectId: projectAUrl, question: "What is it?" });
  assert.match(result.answer, /can't find|couldn't put that together/i);
});

test("accepts Gemma's fenced JSON and verifies its exact quoted evidence", async () => {
  const service = serviceWith({ answer: [
    "```json",
    JSON.stringify({ claims: [{
      text: "The app reads scanned documents aloud on a laptop.",
      evidence: [{ sourceId: "dev", heading: "Purpose", quote: "A pocket field notebook for hikers." }],
    }] }),
    "```",
  ].join("\n") });
  const result = await service.ask({ projectId: projectAUrl, question: "How are field notes stored?" });
  assert.equal(result.answer, "The app reads scanned documents aloud on a laptop.");
  assert.deepEqual(result.citations, []);
});

test("uses the conversational model path for vague overview questions", async () => {
  let modelCalled = false;
  const project = {
    ...projectA,
    description: "A pocket field notebook for hikers that saves notes offline.",
  };
  const service = serviceWith({
    project,
    answer: JSON.stringify({ claims: [{
      text: "It's a pocket notebook for hikers, with notes saved offline for the trail.",
      evidence: [{ sourceId: "dev-description", heading: "Description", quote: project.description }],
    }] }),
    onPrompt: () => { modelCalled = true; },
  });
  const result = await service.ask({ projectId: projectAUrl, question: "what the hell is this project about" });
  assert.match(result.answer, /pocket notebook for hikers/i);
  assert.deepEqual(result.citations, []);
  assert.equal(modelCalled, true);
});

test("answers broad project questions from the saved description when Gemma returns no claims", async () => {
  const project = {
    ...projectA,
    description: "A pocket field notebook for hikers that keeps notes available offline.",
  };
  const service = serviceWith({ project, answer: '{"claims":[]}' });
  const result = await service.ask({
    projectId: projectAUrl,
    question: "What does it do?",
    includeSources: true,
  });

  assert.match(result.answer, /pocket field notebook for hikers/i);
  assert.equal(result.citations[0].url, projectAUrl);
  assert.equal(result.citations[0].quote, project.description);
});

test("rejects Gemma's generic fallbacks even with valid quotes and explains an informal overview question", async () => {
  const project = {
    ...projectA,
    title: "Paper Trail: a field card for walkers",
    description: "Nature apps have an awkward habit: they get you outside, then ask you to look at your phone.",
    markdown: [
      "Nature apps have an awkward habit: they get you outside, then ask you to look at your phone.",
      "# What I Built",
      "**Paper Trail** creates a printable field card for a walk, with locally reported species, identification tips, weather, and a daylight time estimate. The card helps walkers keep their phone in their pocket.",
    ].join("\n\n"),
  };
  const service = serviceWith({
    project,
    answer: JSON.stringify({ claims: [
      {
        text: "I don't have enough context to answer, but here's one relevant detail: Nature apps have an awkward habit.",
        evidence: [{ sourceId: "dev", heading: null, quote: project.description }],
      },
      {
        text: "I couldn't put that together clearly, but I did find this relevant detail: Nature apps have an awkward habit: they get you outside, then ask you to look at your phone.",
        evidence: [{ sourceId: "dev", heading: null, quote: project.description }],
      },
    ] }),
    recoveryAnswer: '{"claims":[]}',
    onPrompt: (prompt) => { assert.match(prompt, /What I Built/); },
  });

  const result = await service.ask({
    projectId: projectAUrl,
    question: "explain simply whats this project is about",
    includeSources: true,
  });

  assert.match(result.answer, /Paper Trail creates a printable field card/i);
  assert.doesNotMatch(result.answer, /couldn't put that together|relevant detail/i);
  assert.equal(result.citations[0].heading, "What I Built");
});

test("overview fallback finds the actual project description after a narrative hook", async () => {
  const project = {
    ...projectA,
    title: "Project JARVIS: The Offline AI Lab Assistant",
    description: "This is a submission for the Hacktoberfest Weekend Challenge: Build for a Friend...",
    markdown: [
      "## What I Built",
      "Ask a new student where the vernier is, and most will say nothing. They'll wander, give up, and not come back.",
      "The lab has many tools and components, so finding the right one and tracking loans is difficult.",
      "Now my junior coordinates the lab, so I built JARVIS: an offline AI assistant you talk to. It points a laser at the tool you need, lights up component boxes, and keeps the lending log.",
      "It runs entirely on an Arduino UNO Q with 2 GB of RAM: no internet, no cloud account, no API key.",
    ].join("\n\n"),
  };
  const service = serviceWith({
    project,
    answer: JSON.stringify({ claims: [{
      text: "I couldn't put that together clearly, but I did find this relevant detail: Ask a new student where the vernier is, and most will say nothing.",
      evidence: [{ sourceId: "dev", heading: "What I Built", quote: "Ask a new student where the vernier is, and most will say nothing." }],
    }] }),
    recoveryAnswer: '{"claims":[]}',
  });

  const result = await service.ask({ projectId: projectAUrl, question: "What is this project about?", includeSources: true });

  assert.match(result.answer, /JARVIS: an offline AI assistant you talk to/i);
  assert.match(result.answer, /points a laser at the tool/i);
  assert.equal(result.citations[0].heading, "What I Built");
});

test("recognizes 'what is this project all about' and skips challenge boilerplate", async () => {
  const challengeCopy = "This is a submission for the Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass.";
  const project = {
    ...projectA,
    description: `${challengeCopy} ...`,
    markdown: [
      `# Submission\n${challengeCopy}`,
      "## What I Built\nA local walking companion recommends one nearby outdoor plan based on weather and available time.",
    ].join("\n\n"),
  };
  let prompt = "";
  const service = serviceWith({
    project,
    answer: '{"claims":[]}',
    onPrompt: (value) => { prompt = value; },
  });

  const result = await service.ask({
    projectId: projectAUrl,
    question: "What is this project all about?",
    includeSources: true,
  });

  assert.match(result.answer, /local walking companion recommends one nearby outdoor plan/i);
  assert.doesNotMatch(result.answer, /Hacktoberfest/);
  assert.equal(result.citations[0].url, projectAUrl);
  assert.match(prompt, /What I Built/);
  assert.doesNotMatch(prompt, /dev-description[\s\S]*Hacktoberfest/);
});

test("treats a Hindi language request as a conversation preference, not a source search", async () => {
  let prompt = "";
  let modelCalls = 0;
  const service = createChatService({
    resolveProjectSources: async () => projectA,
    generateAnswer: async (value) => {
      modelCalls += 1;
      prompt = value;
      return JSON.stringify({ claims: [{
        text: "यह hikers के लिए एक pocket field notebook है।",
        evidence: [{ sourceId: "dev", heading: "Purpose", quote: "A pocket field notebook for hikers." }],
      }] });
    },
  });

  const preference = await service.ask({
    projectId: projectAUrl,
    question: "Can you talk in Hindi or explain in Hindi?",
    includeSources: true,
  });
  assert.match(preference.answer, /हिंदी में जवाब दूँगा/);
  assert.deepEqual(preference.citations, []);
  assert.equal(modelCalls, 0);

  const followUp = await service.ask({
    projectId: projectAUrl,
    question: "What does it do?",
    sessionId: preference.sessionId,
    includeSources: true,
  });
  assert.match(prompt, /Respond in Hindi/);
  assert.match(followUp.answer, /hikers/);
  assert.equal(followUp.citations[0].quote, "A pocket field notebook for hikers.");
});

test("keeps focused explain questions on the AI evidence path", async () => {
  let modelCalled = false;
  const service = serviceWith({
    answer: '{"claims":[]}',
    onPrompt: () => { modelCalled = true; },
  });
  await service.ask({ projectId: projectAUrl, question: "Explain how offline note storage works." });
  assert.equal(modelCalled, true);
});

test("uses the conversational model for a documented tech-stack question", async () => {
  const project = {
    ...projectA,
    markdown: "# Overview\nA field notebook.\n# Tech Stack\nThe frontend uses React and the API runs on Node.js.",
    repositories: [],
  };
  let modelCalled = false;
  const service = serviceWith({
    project,
    answer: JSON.stringify({ claims: [{
      text: "React handles the frontend, while Node.js runs the API.",
      evidence: [{ sourceId: "dev", heading: "Tech Stack", quote: "The frontend uses React and the API runs on Node.js." }],
    }] }),
    onPrompt: () => { modelCalled = true; },
  });
  const result = await service.ask({ projectId: projectAUrl, question: "What technologies are used?" });
  assert.match(result.answer, /React.*Node\.js/);
  assert.deepEqual(result.citations, []);
  assert.equal(modelCalled, true);
});

test("retrieves only question-relevant source passages while preserving evidence", () => {
  const project = {
    ...projectA,
    markdown: "# Overview\nA small outdoor planning app.\n# Weather scoring\nIt compares hourly weather forecasts to choose a suitable time to go outside.\n# Deployment\nThe demo runs through Docker Compose.",
    repositories: [],
  };
  const selected = selectRelevantSources(buildSources(project), "How does weather choose an outside time?");
  const included = JSON.stringify(selected);
  assert.match(included, /hourly weather forecasts/);
  assert.doesNotMatch(included, /Docker Compose/);
  assert.ok(selected.reduce((size, source) => size + source.sections.reduce((total, section) => total + section.text.length, 0), 0) <= 7000);
});

test("converts Ollama failures to a safe unavailable error", async () => {
  const service = createChatService({ resolveProjectSources: async () => projectA, generateAnswer: async () => { throw new Error("internal URL and token"); } });
  await assert.rejects(
    service.ask({ projectId: projectAUrl, question: "How are notes stored?" }),
    (error) => error.status === 503 && !error.message.includes("token"),
  );
});

test("converts source lookup failures to a safe error", async () => {
  const service = createChatService({ resolveProjectSources: async () => { throw new Error("filesystem path"); }, generateAnswer: async () => "{}" });
  await assert.rejects(service.ask({ projectId: projectAUrl, question: "Question?" }), (error) => error.code === "SOURCES_UNAVAILABLE");
});

test("fails clearly when the selected winner has no verified cached sources", async () => {
  const service = createChatService({ resolveProjectSources: async () => null, generateAnswer: async () => "{}" });
  await assert.rejects(service.ask({ projectId: projectAUrl, question: "Question?" }), (error) => error.status === 404 && error.code === "SOURCES_NOT_FOUND");
});

test("binds conversation sessions to their original project", async () => {
  const projects = new Map([
    [projectAUrl, projectA],
    [projectBUrl, { ...projectA, projectId: projectBUrl, submissionUrl: projectBUrl, title: "Project B", description: "A recipe organizer.", markdown: "# Purpose\nA recipe organizer.", repositories: [] }],
  ]);
  const prompts = [];
  const service = createChatService({
    resolveProjectSources: async (id) => projects.get(id),
    generateAnswer: async (prompt) => { prompts.push(prompt); return '{"claims":[]}'; },
  });
  const first = await service.ask({ projectId: projectAUrl, question: "Question for A" });
  await assert.rejects(
    service.ask({ projectId: projectBUrl, question: "Question for B", sessionId: first.sessionId }),
    (error) => error.code === "SESSION_PROJECT_MISMATCH",
  );
  await service.ask({ projectId: projectBUrl, question: "Question for B" });
  assert.match(prompts[0], /field notebook/);
  assert.doesNotMatch(prompts[0], /recipe organizer/);
  assert.match(prompts[1], /recipe organizer/);
  assert.doesNotMatch(prompts[1], /field notebook/);
});

test("rejects empty and oversized questions before calling the model", async () => {
  let called = false;
  const service = serviceWith({ answer: "{}", onPrompt: () => { called = true; } });
  await assert.rejects(service.ask({ projectId: projectAUrl, question: "  " }), (error) => error.status === 400);
  await assert.rejects(service.ask({ projectId: projectAUrl, question: "x".repeat(1001) }), (error) => error.status === 400);
  assert.equal(called, false);
});

test("rejects non-DEV project IDs without resolving sources", async () => {
  let called = false;
  const service = createChatService({ resolveProjectSources: async () => { called = true; return projectA; }, generateAnswer: async () => "{}" });
  await assert.rejects(service.ask({ projectId: "https://example.com/a", question: "Question?" }), (error) => error.status === 400);
  assert.equal(called, false);
});

test("rejects client-provided sources or history at the route boundary", () => {
  assert.match(validateChatPayload({ projectId: projectAUrl, question: "Q", sources: ["fake"] }), /Only projectId/);
  assert.match(validateChatPayload({ projectId: projectAUrl, question: "Q", history: [] }), /Only projectId/);
  assert.equal(validateChatPayload({ projectId: projectAUrl, question: "Q" }), null);
  assert.equal(validateChatPayload({ projectId: projectAUrl, question: "Q", includeSources: true }), null);
});

test("keeps long conversation history bounded to recent exchanges", async () => {
  const prompts = [];
  const service = serviceWith({ answer: '{"claims":[]}', onPrompt: (prompt) => prompts.push(prompt) });
  const { sessionId } = await service.ask({ projectId: projectAUrl, question: "oldest-marker" });
  for (let index = 0; index < 8; index += 1) {
    await service.ask({ projectId: projectAUrl, question: `recent-marker-${index}`, sessionId });
  }
  assert.doesNotMatch(prompts.at(-1), /oldest-marker/);
  assert.match(prompts.at(-1), /recent-marker-7/);
});

test("loads verified source documents once per conversation and reuses them", async () => {
  let lookups = 0;
  const service = createChatService({
    resolveProjectSources: async () => { lookups += 1; return projectA; },
    generateAnswer: async () => '{"claims":[]}',
  });
  const first = await service.ask({ projectId: projectAUrl, question: "First question" });
  await service.ask({ projectId: projectAUrl, question: "Follow-up", sessionId: first.sessionId });
  assert.equal(lookups, 1);
});

test("does not send generated summaries as chatbot source material", async () => {
  const summarizedProject = { ...projectA, summary: "PRIVATE GENERATED SUMMARY MARKER" };
  let prompt = "";
  const service = serviceWith({ project: summarizedProject, answer: '{"claims":[]}', onPrompt: (value) => { prompt = value; } });
  await service.ask({ projectId: projectAUrl, question: "What is documented?" });
  assert.doesNotMatch(prompt, /PRIVATE GENERATED SUMMARY MARKER/);
});

test("refuses to silently truncate oversized saved source bundles", async () => {
  const hugeProject = { ...projectA, markdown: "x".repeat(25001) };
  const service = serviceWith({ project: hugeProject, answer: "{}" });
  await assert.rejects(service.ask({ projectId: projectAUrl, question: "Question?" }), (error) => error.code === "SOURCES_TOO_LARGE");
});

test("uses article-only sources when no verified README was selected", async () => {
  const articleOnly = { ...projectA, repositories: [] };
  let prompt = "";
  const service = serviceWith({ project: articleOnly, answer: '{"claims":[]}', onPrompt: (value) => { prompt = value; } });
  await service.ask({ projectId: projectAUrl, question: "What color is it?" });
  assert.match(prompt, /DEV.to submission/);
  assert.doesNotMatch(prompt, /Project repository README/);
});

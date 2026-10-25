const test = require("node:test");
const assert = require("node:assert/strict");

const ollamaService = require("./ollama.service");
const { selectRelevantRepositories } = require("./repository-relevance.service");
const { createRegeneratedCacheEntry } = require("./digest.service");

const originalFetch = global.fetch;

test.afterEach(() => {
  global.fetch = originalFetch;
});

test("an unrelated README candidate is excluded for the DEV submission", async () => {
  const project = {
    title: "Chaptermill: podcast back-catalog show notes",
    description: "Generate searchable podcast transcripts and show notes.",
    url: "https://dev.to/author/chaptermill",
    markdown: "The app indexes podcast episodes and generates show notes.",
  };
  const temporal = {
    repositoryUrl: "https://github.com/temporalio/temporal",
    readme: "Temporal is a durable workflow execution platform.",
  };

  const selected = await selectRelevantRepositories(
    project,
    [temporal],
    async (submission, candidate) => {
      assert.equal(submission.title, project.title);
      assert.equal(submission.description, project.description);
      assert.equal(submission.markdown, project.markdown);
      assert.match(candidate.readme, /workflow execution platform/);
      return false;
    },
  );

  assert.deepEqual(selected, []);
});

test("a clearly relevant README is retained with its original URL", async () => {
  const chaptermill = {
    repositoryUrl: "https://github.com/Bowen1314/chaptermill",
    readme: "Chaptermill turns podcast episodes into transcripts and show notes.",
  };
  const selected = await selectRelevantRepositories(
    { title: "Chaptermill podcast notes" },
    [chaptermill],
    async () => true,
  );

  assert.deepEqual(selected, [chaptermill]);
  assert.equal(selected[0].repositoryUrl, chaptermill.repositoryUrl);
});

test("ambiguous classifications and Ollama failures fail closed", async () => {
  const candidates = [
    { repositoryUrl: "https://github.com/example/ambiguous", readme: "Maybe related." },
    { repositoryUrl: "https://github.com/example/unavailable", readme: "Unavailable." },
  ];
  let call = 0;
  const selected = await selectRelevantRepositories(
    { title: "A specific submitted app" },
    candidates,
    async () => {
      call++;
      if (call === 1) return false;
      throw new Error("Ollama unavailable");
    },
  );

  assert.deepEqual(selected, []);
  assert.equal(ollamaService.parseRepositoryRelevance('{"relevant":true,"confidence":0.6}'), false);
  assert.equal(ollamaService.parseRepositoryRelevance("not json"), false);
  assert.equal(
    ollamaService.parseRepositoryRelevance('{"relevant":true,"confidence":0.95}'),
    true,
  );
});

test("Ollama repository classification receives all source evidence", async () => {
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ response: '{"relevant":true,"confidence":0.93}' }),
    };
  };

  const relevant = await ollamaService.classifyRepositoryRelevance(
    {
      title: "Submission title",
      description: "Submission description",
      url: "https://dev.to/author/post",
      markdown: "Full article content marker",
    },
    {
      repositoryUrl: "https://github.com/author/project",
      readme: "Candidate README marker",
    },
  );

  assert.equal(relevant, true);
  assert.match(requestBody.prompt, /Submission title/);
  assert.match(requestBody.prompt, /Submission description/);
  assert.match(requestBody.prompt, /Full article content marker/);
  assert.match(requestBody.prompt, /Candidate README marker/);

  global.fetch = async () => ({
    ok: true,
    json: async () => ({ response: "uncertain, probably related" }),
  });
  assert.equal(
    await ollamaService.classifyRepositoryRelevance(
      { title: "Submission" },
      { repositoryUrl: "https://github.com/example/project", readme: "README" },
    ),
    false,
  );
});

test("targeted summary regeneration preserves the previous cached summary", () => {
  const oldCache = {
    project: { title: "Old public project" },
    summary: "Incorrect old summary",
    audioIntro: "Old audio intro",
    processedAt: "2026-10-01T00:00:00.000Z",
  };
  const project = {
    title: "Chaptermill",
    url: "https://dev.to/author/chaptermill",
    markdown: "Article source",
    repositories: [
      {
        repositoryUrl: "https://github.com/author/chaptermill",
        readme: "Relevant README",
      },
    ],
  };

  const updated = createRegeneratedCacheEntry(
    oldCache,
    project,
    "Corrected summary",
    "2026-10-25T00:00:00.000Z",
  );

  assert.equal(updated.summary, "Corrected summary");
  assert.equal(updated.summaryHistory[0].summary, "Incorrect old summary");
  assert.equal(updated.summaryHistory[0].audioIntro, "Old audio intro");
  assert.equal(updated.sourceContext.markdown, "Article source");
  assert.equal(
    updated.sourceContext.repositories[0].repositoryUrl,
    "https://github.com/author/chaptermill",
  );
  assert.equal("audioIntro" in updated, false);
});

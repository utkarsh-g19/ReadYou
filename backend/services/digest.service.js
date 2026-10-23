const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const devApiService = require("./dev-api.service");
const winnerExtractor = require("./winner-extractor.service");
const projectResearchService = require("./project-research.service");
const ollamaService = require("./ollama.service");

const REPORTS_DIR = path.resolve(__dirname, "../../reports");
const STATE_FILE = path.join(REPORTS_DIR, "readyou-state.json");
const LATEST_DIGEST_FILE = path.join(REPORTS_DIR, "latest-digest.json");

const jobs = new Map();
let activeJobId = null;

function isWinnerAnnouncement(article) {
  const title = String(article?.title || "").trim();

  return (
    /\bhacktoberfest\b/i.test(title) &&
    /^congrats\b/i.test(title) &&
    /\bwinners?\b/i.test(title) &&
    !/\bdelayed\b/i.test(title)
  );
}

async function readJson(filePath, fallbackValue) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallbackValue;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const temporaryPath = `${filePath}.tmp`;

  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );

  await fs.rename(temporaryPath, filePath);
}

async function loadState() {
  const state = await readJson(STATE_FILE, {});

  if (!Array.isArray(state.processedAnnouncementIds)) {
    state.processedAnnouncementIds = [];
  }

  if (!state.processedWinners || typeof state.processedWinners !== "object") {
    state.processedWinners = {};
  }

  if (
    !state.processedAnnouncements ||
    typeof state.processedAnnouncements !== "object"
  ) {
    state.processedAnnouncements = {};
  }

  return state;
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    message: job.message,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    announcementsFound: job.announcementsFound,
    announcementsToProcess: job.announcementsToProcess,
    announcementsCompleted: job.announcementsCompleted,
    totalWinners: job.totalWinners,
    completedWinners: job.completedWinners,
    successfulWinners: job.successfulWinners,
    failedWinners: job.failedWinners,
    currentAnnouncement: job.currentAnnouncement,
    currentSubmission: job.currentSubmission,
    error: job.error,
  };
}

async function discoverWinnerAnnouncements() {
  const articles = await devApiService.getArticlesByUsername("devteam", 100);

  return articles
    .filter(isWinnerAnnouncement)
    .map((article) => ({
      id: article.id,
      title: article.title,
      url: article.url,
      publishedAt: article.published_at || null,
    }))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
}

function toPublicProject(project) {
  return {
    title: project.title,
    url: project.url,
    description: project.description || "",
    author: project.author || "Unknown",
    publishedAt: project.publishedAt || null,
    githubLinks: project.githubLinks || [],
    repositories: (project.repositories || []).map((repository) => ({
      repositoryUrl: repository.repositoryUrl,
    })),
  };
}

function createDigest(announcements) {
  const sortedAnnouncements = Object.values(announcements).sort((a, b) =>
    String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")),
  );

  const projectCount = sortedAnnouncements.reduce(
    (count, announcement) =>
      count +
      (announcement.winners || []).filter(
        (winner) => winner.status === "completed",
      ).length,
    0,
  );

  const failedCount = sortedAnnouncements.reduce((count, announcement) => {
    const failedWinners = (announcement.winners || []).filter(
      (winner) => winner.status === "failed",
    ).length;

    const failedAnnouncement =
      announcement.status === "failed" &&
      (announcement.winners || []).length === 0
        ? 1
        : 0;

    return count + failedWinners + failedAnnouncement;
  }, 0);

  return {
    title: "Hacktoberfest Winners — Weekly Digest",
    generatedAt: new Date().toISOString(),
    status: failedCount > 0 ? "partial" : "completed",
    announcementCount: sortedAnnouncements.length,
    projectCount,
    failedCount,
    announcements: sortedAnnouncements,
  };
}

async function runBuild(job) {
  job.status = "running";
  job.stage = "discovering";
  job.message = "Discovering official winner announcements.";
  job.startedAt = new Date().toISOString();

  try {
    await fs.mkdir(REPORTS_DIR, { recursive: true });

    const state = await loadState();
    const announcements = await discoverWinnerAnnouncements();

    const processedIds = new Set(state.processedAnnouncementIds.map(String));

    const pendingAnnouncements = announcements.filter(
      (announcement) => !processedIds.has(String(announcement.id)),
    );

    job.announcementsFound = announcements.length;
    job.announcementsToProcess = pendingAnnouncements.length;

    if (pendingAnnouncements.length === 0) {
      const digest = createDigest(state.processedAnnouncements);

      await writeJson(LATEST_DIGEST_FILE, digest);

      job.status = "completed";
      job.stage = "finished";
      job.message = "No new winner announcements. Existing digest refreshed.";
      job.finishedAt = new Date().toISOString();
      return;
    }

    for (const candidate of pendingAnnouncements) {
      job.currentAnnouncement = candidate.title;

      let article;

      try {
        article = await devApiService.getArticleById(candidate.id);
      } catch (error) {
        state.processedAnnouncements[String(candidate.id)] = {
          ...candidate,
          status: "failed",
          error: `Could not retrieve announcement: ${error.message}`,
          winners: [],
        };

        job.failedWinners++;
        job.announcementsCompleted++;

        await writeJson(STATE_FILE, state);
        continue;
      }

      // Confirm that the retrieved article is an actual winner announcement.
      if (!isWinnerAnnouncement(article)) {
        job.announcementsCompleted++;
        continue;
      }

      const extractedWinners = winnerExtractor.extractWinners(
        article.body_markdown || "",
      );

      job.totalWinners += extractedWinners.length;

      const digestAnnouncement = {
        id: article.id,
        title: article.title,
        url: article.url,
        publishedAt: article.published_at || null,
        status: "completed",
        winners: [],
      };

      if (extractedWinners.length === 0) {
        digestAnnouncement.status = "failed";
        digestAnnouncement.error =
          "No winner submission links were extracted from the announcement.";

        state.processedAnnouncements[String(article.id)] = digestAnnouncement;

        job.failedWinners++;
        job.announcementsCompleted++;

        await writeJson(STATE_FILE, state);
        continue;
      }

      let announcementHadFailure = false;

      for (const winner of extractedWinners) {
        job.stage = "researching";
        job.currentSubmission = winner.submissionUrl;

        let cached = state.processedWinners[winner.submissionUrl];

        if (!cached) {
          try {
            const project = await projectResearchService.getSubmissionByUrl(
              winner.submissionUrl,
            );

            job.stage = "summarizing";

            const summary = await ollamaService.generateSummary(project);

            cached = {
              project: toPublicProject(project),
              summary,
              processedAt: new Date().toISOString(),
            };

            state.processedWinners[winner.submissionUrl] = cached;

            // Save each successful summary to avoid generating it again.
            await writeJson(STATE_FILE, state);
          } catch (error) {
            announcementHadFailure = true;
            job.failedWinners++;
            job.completedWinners++;

            digestAnnouncement.winners.push({
              category: winner.category,
              submissionUrl: winner.submissionUrl,
              status: "failed",
              error: error.message,
            });

            continue;
          }
        }

        digestAnnouncement.winners.push({
          category: winner.category,
          submissionUrl: winner.submissionUrl,
          status: "completed",
          project: cached.project,
          summary: cached.summary,
        });

        job.successfulWinners++;
        job.completedWinners++;
      }

      if (announcementHadFailure) {
        digestAnnouncement.status = "partial";
      } else {
        const alreadyProcessed = state.processedAnnouncementIds.some(
          (id) => String(id) === String(article.id),
        );

        if (!alreadyProcessed) {
          state.processedAnnouncementIds.push(article.id);
        }
      }

      // Retain results from previous announcements as well as this one.
      state.processedAnnouncements[String(article.id)] = digestAnnouncement;

      await writeJson(STATE_FILE, state);
      job.announcementsCompleted++;
    }

    const digest = createDigest(state.processedAnnouncements);

    await writeJson(LATEST_DIGEST_FILE, digest);

    job.status = "completed";
    job.stage = "finished";
    job.message =
      digest.failedCount > 0
        ? "Digest generated with some failures. Failed announcements or projects can be retried."
        : "Digest generated successfully.";

    job.finishedAt = new Date().toISOString();
  } catch (error) {
    job.status = "failed";
    job.stage = "failed";
    job.message = "Digest generation failed.";
    job.error = error.message;
    job.finishedAt = new Date().toISOString();
  } finally {
    job.currentAnnouncement = null;
    job.currentSubmission = null;

    if (activeJobId === job.id) {
      activeJobId = null;
    }
  }
}

async function startBuild() {
  if (activeJobId && jobs.has(activeJobId)) {
    return {
      alreadyRunning: true,
      job: publicJob(jobs.get(activeJobId)),
    };
  }

  const job = {
    id: randomUUID(),
    status: "queued",
    stage: "queued",
    message: "Digest job queued.",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    announcementsFound: 0,
    announcementsToProcess: 0,
    announcementsCompleted: 0,
    totalWinners: 0,
    completedWinners: 0,
    successfulWinners: 0,
    failedWinners: 0,
    currentAnnouncement: null,
    currentSubmission: null,
    error: null,
  };

  jobs.set(job.id, job);
  activeJobId = job.id;

  // Run in the background; the caller receives the job ID immediately.
  void runBuild(job);

  return {
    alreadyRunning: false,
    job: publicJob(job),
  };
}

function getJob(jobId) {
  const job = jobs.get(jobId);
  return job ? publicJob(job) : null;
}

async function getLatestDigest() {
  return readJson(LATEST_DIGEST_FILE, null);
}

async function runAudioIntroBuild(job) {
  job.status = "running";
  job.stage = "generating-audio-intros";
  job.message = "Generating friendly audio introductions.";
  job.startedAt = new Date().toISOString();

  try {
    const state = await loadState();
    const announcementEntries = Object.entries(state.processedAnnouncements);

    const tasksByUrl = new Map();

    for (const [announcementId, announcement] of announcementEntries) {
      for (const winner of announcement.winners || []) {
        if (winner.status !== "completed" || !winner.submissionUrl) {
          continue;
        }

        const cached = state.processedWinners[winner.submissionUrl];

        // Reuse existing introductions instead of generating them again.
        const existingIntro = cached?.audioIntro || winner.audioIntro;

        if (existingIntro) {
          winner.audioIntro = existingIntro;
          continue;
        }

        if (!tasksByUrl.has(winner.submissionUrl)) {
          tasksByUrl.set(winner.submissionUrl, {
            announcementId,
            winner,
            url: winner.submissionUrl,
          });
        }
      }
    }

    const tasks = [...tasksByUrl.values()];

    job.announcementsFound = announcementEntries.length;
    job.totalWinners = tasks.length;

    if (tasks.length === 0) {
      await writeJson(
        LATEST_DIGEST_FILE,
        createDigest(state.processedAnnouncements),
      );

      job.status = "completed";
      job.stage = "finished";
      job.message = "All available winners already have audio introductions.";
      job.finishedAt = new Date().toISOString();
      return;
    }

    for (const task of tasks) {
      const announcement = state.processedAnnouncements[task.announcementId];

      const cached = state.processedWinners[task.url] || {};

      job.currentAnnouncement = announcement?.title || null;
      job.currentSubmission = task.url;

      try {
        const project = cached.project || task.winner.project;
        const summary = cached.summary || task.winner.summary;

        if (!project || !summary) {
          throw new Error(
            "Cached project details or technical summary are missing.",
          );
        }

        const audioIntro = await ollamaService.generateAudioIntro(
          project,
          summary,
        );

        cached.project = project;
        cached.summary = summary;
        cached.audioIntro = audioIntro;

        state.processedWinners[task.url] = cached;

        // Attach the introduction to every occurrence of this submission.
        for (const currentAnnouncement of Object.values(
          state.processedAnnouncements,
        )) {
          for (const winner of currentAnnouncement.winners || []) {
            if (winner.submissionUrl === task.url) {
              winner.audioIntro = audioIntro;
              delete winner.audioIntroError;
            }
          }
        }

        job.successfulWinners++;
      } catch (error) {
        job.failedWinners++;

        for (const currentAnnouncement of Object.values(
          state.processedAnnouncements,
        )) {
          for (const winner of currentAnnouncement.winners || []) {
            if (winner.submissionUrl === task.url) {
              winner.audioIntroError = error.message;
            }
          }
        }

        console.error(`Audio intro failed for ${task.url}:`, error.message);
      }

      job.completedWinners++;

      // Persist after each attempt, so completed work survives interruptions.
      await writeJson(STATE_FILE, state);

      await writeJson(
        LATEST_DIGEST_FILE,
        createDigest(state.processedAnnouncements),
      );
    }

    job.status = "completed";
    job.stage = "finished";
    job.message =
      job.failedWinners > 0
        ? "Audio introductions generated with some failures. Failed introductions can be retried."
        : "All missing audio introductions generated successfully.";
    job.finishedAt = new Date().toISOString();
  } catch (error) {
    job.status = "failed";
    job.stage = "failed";
    job.message = "Audio introduction generation failed.";
    job.error = error.message;
    job.finishedAt = new Date().toISOString();
  } finally {
    job.currentAnnouncement = null;
    job.currentSubmission = null;

    if (activeJobId === job.id) {
      activeJobId = null;
    }
  }
}

async function startAudioIntroBuild() {
  if (activeJobId && jobs.has(activeJobId)) {
    const activeJob = jobs.get(activeJobId);

    if (activeJob.status === "running" || activeJob.status === "queued") {
      return {
        alreadyRunning: true,
        job: publicJob(activeJob),
      };
    }
  }

  const job = {
    id: randomUUID(),
    status: "queued",
    stage: "queued",
    message: "Audio introduction job queued.",
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    announcementsFound: 0,
    announcementsToProcess: 0,
    announcementsCompleted: 0,
    totalWinners: 0,
    completedWinners: 0,
    successfulWinners: 0,
    failedWinners: 0,
    currentAnnouncement: null,
    currentSubmission: null,
    error: null,
  };

  jobs.set(job.id, job);
  activeJobId = job.id;

  void runAudioIntroBuild(job);

  return {
    alreadyRunning: false,
    job: publicJob(job),
  };
}

async function checkForNewAnnouncements() {
  const announcements = await discoverWinnerAnnouncements();
  const state = await loadState();

  const processedIds = new Set(state.processedAnnouncementIds.map(String));

  const pendingAnnouncements = announcements.filter(
    (announcement) => !processedIds.has(String(announcement.id)),
  );

  return {
    announcementsFound: announcements.length,
    pendingAnnouncements,
  };
}

module.exports = {
  discoverWinnerAnnouncements,
  checkForNewAnnouncements,
  startBuild,
  startAudioIntroBuild,
  getJob,
  getLatestDigest,
};

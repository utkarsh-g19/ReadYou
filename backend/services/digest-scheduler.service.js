const fs = require("node:fs/promises");
const path = require("node:path");

const digestService = require("./digest.service");
const emailService = require("./email.service");

const REPORTS_DIR = path.resolve(__dirname, "../../reports");
const STATE_FILE = path.join(REPORTS_DIR, "readyou-state.json");
const EMAIL_STATE_FILE = path.join(REPORTS_DIR, "emailed-announcements.json");

const INTERVAL_HOURS = Math.max(
  1,
  Number(process.env.DIGEST_SCAN_INTERVAL_HOURS) || 3,
);

let intervalHandle = null;
let scanInProgress = false;

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, data) {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function notifyNewAnnouncements(announcements) {
  const state = await readJson(STATE_FILE, {
    processedAnnouncementIds: [],
  });

  const processedIds = (state.processedAnnouncementIds || []).map(String);

  let emailState = await readJson(EMAIL_STATE_FILE, null);

  // On the first setup, don't email about announcements that
  // ReadYou had already processed before notifications were added.
  if (!emailState) {
    emailState = {
      notifiedAnnouncementIds: processedIds,
    };
    await writeJson(EMAIL_STATE_FILE, emailState);
  }

  const notifiedIds = new Set(
    (emailState.notifiedAnnouncementIds || []).map(String),
  );

  const newAnnouncements = announcements.filter(
    (item) => item.id != null && !notifiedIds.has(String(item.id)),
  );

  if (newAnnouncements.length === 0) {
    console.log("[Scheduler] No new announcements to email.");
    return;
  }

  if (!emailService.isConfigured()) {
    console.warn(
      `[Scheduler] Found ${newAnnouncements.length} new announcement(s), but email settings are missing.`,
    );
    return;
  }

  // If sending fails, do not mark these announcements as notified.
  // The next scan can retry the email.
  await emailService.sendNewWinnerAnnouncements(newAnnouncements);

  for (const item of newAnnouncements) {
    notifiedIds.add(String(item.id));
  }

  await writeJson(EMAIL_STATE_FILE, {
    notifiedAnnouncementIds: [...notifiedIds],
  });
}

async function scanForNewWinners(reason) {
  if (scanInProgress) {
    console.log("[Scheduler] Scan already in progress; skipping.");
    return;
  }

  scanInProgress = true;
  console.log(`[Scheduler] ${reason}: checking DEV...`);

  try {
    const announcements = await digestService.discoverWinnerAnnouncements();

    console.log(
      `[Scheduler] Found ${announcements.length} official winner announcement(s).`,
    );

    try {
      await notifyNewAnnouncements(announcements);
    } catch (error) {
      // Email failure should not stop digest processing.
      console.error("[Scheduler] Email notification failed:", error.message);
    }

    const result = await digestService.startBuild();

    console.log(
      result.alreadyRunning
        ? "[Scheduler] A digest build is already running."
        : `[Scheduler] Digest job started: ${result.job.id}`,
    );
  } catch (error) {
    console.error("[Scheduler] Scan failed:", error.message);
  } finally {
    scanInProgress = false;
  }
}

function startDigestScheduler() {
  if (intervalHandle) return;

  console.log(
    `[Scheduler] Startup scan enabled; repeating every ${INTERVAL_HOURS} hours.`,
  );

  void scanForNewWinners("Startup scan");

  intervalHandle = setInterval(
    () => {
      void scanForNewWinners("Scheduled scan");
    },
    INTERVAL_HOURS * 60 * 60 * 1000,
  );
}

module.exports = { startDigestScheduler };

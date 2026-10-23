import { useEffect, useMemo, useRef, useState } from "react";

function getChallengeName(title = "") {
  return title
    .replace(/^congrats to the\s+/i, "")
    .replace(/\s+winners!?$/i, "");
}

function FormattedSummary({ text }) {
  const knownHeadings = new Set([
    "The Idea",
    "Problem & Solution",
    "Challenges & Solutions",
    "Tech Stack",
    "Workflow",
    "Limitations",
  ]);

  const sections = [];
  let currentSection = null;

  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*#{1,3}\s+(.+?)\s*$/);
    const heading = match?.[1]?.trim();

    if (heading && knownHeadings.has(heading)) {
      currentSection = { title: heading, lines: [] };
      sections.push(currentSection);
    } else if (currentSection && line.trim()) {
      currentSection.lines.push(line.trim());
    } else if (!currentSection && line.trim()) {
      currentSection = { title: "Project briefing", lines: [line.trim()] };
      sections.push(currentSection);
    }
  }

  if (sections.length === 0) {
    return <p>{text || "No summary available."}</p>;
  }

  return (
    <div className="formatted-summary">
      {sections.map((section, index) => (
        <section className="summary-section" key={`${section.title}-${index}`}>
          <h5>{section.title}</h5>
          <p>{section.lines.join(" ").replace(/\s+/g, " ")}</p>
        </section>
      ))}
    </div>
  );
}

function ElevenLabsListenPlayer({ projects }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const audioRef = useRef(null);
  const queueRef = useRef([]);
  const indexRef = useRef(0);
  const runRef = useRef(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    return () => {
      runRef.current += 1;

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  async function playNext(runId) {
    if (runId !== runRef.current) return;

    const queue = queueRef.current;

    if (indexRef.current >= queue.length) {
      setStatus("idle");
      setMessage("You've reached the end of this digest.");
      audioRef.current = null;
      pausedRef.current = false;
      return;
    }

    const project = queue[indexRef.current++];
    const projectName = project.project?.title || "Untitled project";

    setStatus("loading");
    setMessage(
      `Preparing ${indexRef.current} of ${queue.length}: ${projectName}`,
    );

    try {
      const response = await fetch("/api/audio/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionUrl: project.submissionUrl }),
      });

      const result = await response.json();

      if (!response.ok || !result.success || !result.audioUrl) {
        throw new Error(result.message || "Could not prepare project audio.");
      }

      // Ignore any response that arrives after Stop or a new playback session.
      if (runId !== runRef.current) return;

      const audio = new Audio(result.audioUrl);
      audio.preload = "auto";
      audioRef.current = audio;

      audio.onended = () => {
        if (runId === runRef.current) {
          audioRef.current = null;
          void playNext(runId);
        }
      };

      audio.onerror = () => {
        if (runId !== runRef.current) return;
        audioRef.current = null;
        setStatus("error");
        setMessage(
          `Audio failed for “${projectName}”. Press Play to retry the digest.`,
        );
      };

      if (pausedRef.current) {
        setStatus("paused");
        setMessage("Paused. Press Resume when you're ready.");
        return;
      }

      setStatus("playing");
      setMessage(
        `Playing ${indexRef.current} of ${queue.length}: ${projectName}`,
      );
      await audio.play();
    } catch (error) {
      if (runId !== runRef.current) return;
      setStatus("error");
      setMessage(error.message || "Audio playback failed.");
    }
  }

  function startPlayback() {
    const availableProjects = projects.filter(
      (project) =>
        project.status === "completed" &&
        typeof project.audioIntro === "string" &&
        project.audioIntro.trim() &&
        typeof project.submissionUrl === "string" &&
        project.submissionUrl.trim(),
    );

    if (!availableProjects.length) {
      setStatus("error");
      setMessage(
        "No completed audio introductions are available for this selection.",
      );
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    queueRef.current = availableProjects;
    indexRef.current = 0;
    pausedRef.current = false;
    runRef.current += 1;

    void playNext(runRef.current);
  }

  function togglePlayback() {
    if (status === "playing" && audioRef.current) {
      pausedRef.current = true;
      audioRef.current.pause();
      setStatus("paused");
      setMessage("Digest paused.");
      return;
    }

    if (status === "paused") {
      pausedRef.current = false;

      if (audioRef.current) {
        audioRef.current
          .play()
          .then(() => {
            setStatus("playing");
            setMessage("Resuming digest.");
          })
          .catch((error) => {
            setStatus("error");
            setMessage(error.message || "Could not resume audio.");
          });
      } else {
        // A request may still be in flight if the player was paused mid-prepare.
        setMessage("Resuming audio preparation...");
      }
      return;
    }

    startPlayback();
  }

  function stopPlayback() {
    runRef.current += 1;
    pausedRef.current = false;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    queueRef.current = [];
    indexRef.current = 0;
    setStatus("idle");
    setMessage("Playback stopped.");
  }

  return (
    <div className="listen-panel">
      <span className="music-icon" aria-hidden="true">
        ♫
      </span>
      <h3>Your digest, read aloud.</h3>
      <p>Short, friendly project introductions narrated with ElevenLabs.</p>
      <p className="subtext">
        {projects.length} projects in the selected digest.
      </p>

      <div className="audio-controls">
        <button
          className="listen-button"
          onClick={togglePlayback}
          disabled={status === "loading"}
        >
          {status === "playing"
            ? "Ⅱ Pause"
            : status === "paused"
              ? "▶ Resume"
              : status === "loading"
                ? "Preparing audio…"
                : "▶ Play digest"}
        </button>

        <button
          className="stop-button"
          onClick={stopPlayback}
          disabled={status === "idle"}
        >
          ■ Stop
        </button>
      </div>

      <p className="audio-status" role="status" aria-live="polite">
        {message || "Ready to play."}
      </p>
      <p className="subtext">
        Audio is cached on your backend after its first generation, so replaying
        a project won't require another ElevenLabs generation.
      </p>
    </div>
  );
}

function App() {
  const [digest, setDigest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("all");
  const [view, setView] = useState("read");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDigest() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/digests/latest", {
          signal: controller.signal,
        });
        const result = await response.json();

        if (!response.ok || !result.success || !result.digest) {
          throw new Error(result.message || "Could not load digest.");
        }

        setDigest(result.digest);
      } catch (err) {
        if (err.name !== "AbortError") {
          setError(err.message || "Could not load the saved digest.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadDigest();
    return () => controller.abort();
  }, [reloadKey]);

  const announcements = digest?.announcements || [];

  const visibleAnnouncements = useMemo(() => {
    if (selectedWeek === "all") return announcements;

    return announcements.filter(
      (announcement) => String(announcement.id) === selectedWeek,
    );
  }, [announcements, selectedWeek]);

  const projects = useMemo(
    () =>
      visibleAnnouncements.flatMap((announcement) =>
        (announcement.winners || []).map((winner) => ({
          ...winner,
          announcement,
        })),
      ),
    [visibleAnnouncements],
  );

  const readyCount = projects.filter(
    (project) => project.status === "completed" && project.summary,
  ).length;

  return (
    <div className="app">
      <header className="header">
        <a className="logo" href="#top" aria-label="ReadYou home">
          <span className="logo-icon" aria-hidden="true">
            ✳
          </span>
          <span>
            ReadYou<span className="orange">.</span>
          </span>
        </a>

        <span className="event-label">✳ HACKTOBERFEST 2026</span>

        <a className="header-link" href="#digest">
          Explore digest ↘
        </a>
      </header>

      <div className="layout" id="top">
        <main className="content">
          <section className="hero">
            <p className="eyebrow">OPEN SOURCE, WITHOUT THE OVERLOAD</p>
            <h1>
              Great projects.
              <br />
              <span>Better understood.</span>
            </h1>
            <p className="hero-description">
              Explore Hacktoberfest winning projects through clear,
              source-linked technical summaries.
            </p>
          </section>

          <section className="digest" id="digest">
            <div className="digest-heading">
              <div>
                <p className="eyebrow">THE WEEKLY DIGEST</p>
                <h2>Every winner, one place.</h2>
                <p className="subtext">
                  {projects.length} projects in this selection
                </p>
              </div>

              <div className="tabs" role="tablist" aria-label="Digest view">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "read"}
                  className={view === "read" ? "tab active" : "tab"}
                  onClick={() => setView("read")}
                >
                  Read
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "listen"}
                  className={view === "listen" ? "tab active" : "tab"}
                  onClick={() => setView("listen")}
                >
                  Listen ♫
                </button>
              </div>
            </div>

            {loading && <p>Loading your project summaries…</p>}

            {!loading && error && (
              <div className="message" role="alert">
                <p>{error}</p>
                <button onClick={() => setReloadKey((key) => key + 1)}>
                  Try again
                </button>
              </div>
            )}

            {!loading && !error && announcements.length === 0 && (
              <p>No digest found. Generate a digest from your backend first.</p>
            )}

            {!loading && !error && announcements.length > 0 && (
              <>
                <div className="challenge-filter">
                  <label htmlFor="week">Select week</label>
                  <select
                    id="week"
                    value={selectedWeek}
                    onChange={(event) => setSelectedWeek(event.target.value)}
                  >
                    <option value="all">All announcements</option>
                    {announcements.map((announcement) => (
                      <option
                        key={announcement.id}
                        value={String(announcement.id)}
                      >
                        {getChallengeName(announcement.title)}
                      </option>
                    ))}
                  </select>
                </div>

                {view === "read" &&
                  visibleAnnouncements.map((announcement) => (
                    <section className="challenge" key={announcement.id}>
                      <div className="challenge-heading">
                        <div>
                          <p className="eyebrow">HACKTOBERFEST CHALLENGE</p>
                          <h3>{getChallengeName(announcement.title)}</h3>
                          <p className="subtext">
                            {announcement.winners?.length || 0} winning projects
                          </p>
                        </div>

                        {announcement.url && (
                          <a
                            href={announcement.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Official results ↗
                          </a>
                        )}
                      </div>

                      <div className="project-grid">
                        {(announcement.winners || []).map((winner, index) => {
                          const project = winner.project || {};
                          const repo =
                            project.repositories?.[0]?.repositoryUrl ||
                            project.githubLinks?.[0];

                          return (
                            <article
                              className="project-card"
                              key={`${winner.submissionUrl}-${index}`}
                            >
                              <span className="category">
                                {winner.category}
                              </span>
                              <h4>{project.title || "Untitled project"}</h4>
                              <p className="author">
                                By {project.author || "Unknown author"}
                              </p>

                              {project.description && (
                                <p className="description">
                                  {project.description}
                                </p>
                              )}

                              <div className="summary">
                                <p className="eyebrow">READYOU BRIEFING</p>
                                {winner.status === "completed" &&
                                winner.summary ? (
                                  <div className="summary-text">
                                    <FormattedSummary text={winner.summary} />
                                  </div>
                                ) : (
                                  <p>
                                    Summary unavailable. Visit the original
                                    submission for details.
                                  </p>
                                )}
                              </div>

                              <div className="source-links">
                                {winner.submissionUrl && (
                                  <a
                                    href={winner.submissionUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Read on DEV ↗
                                  </a>
                                )}
                                {repo && (
                                  <a
                                    href={repo}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    GitHub ↗
                                  </a>
                                )}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}

                {view === "listen" && (
                  <ElevenLabsListenPlayer
                    key={selectedWeek}
                    projects={projects}
                  />
                )}
              </>
            )}
          </section>
        </main>

        <aside className="sidebar">
          <div className="week-panel">
            <p className="eyebrow">YOUR READING LIST</p>
            <h2>Select week</h2>

            <select
              value={selectedWeek}
              onChange={(event) => setSelectedWeek(event.target.value)}
              disabled={announcements.length === 0}
              aria-label="Select a challenge announcement"
            >
              <option value="all">All announcements</option>
              {announcements.map((announcement) => (
                <option key={announcement.id} value={String(announcement.id)}>
                  {getChallengeName(announcement.title)}
                </option>
              ))}
            </select>

            <div className="divider" />
            <div className="stat">
              <span>Projects</span>
              <strong>{projects.length}</strong>
            </div>
            <div className="stat">
              <span>Briefings ready</span>
              <strong>{readyCount}</strong>
            </div>
            <div className="stat">
              <span>Announcements</span>
              <strong>{visibleAnnouncements.length}</strong>
            </div>
          </div>

          <div className="sidebar-note">
            <span className="note-star" aria-hidden="true">
              ✳
            </span>
            <p className="eyebrow">LESS NOISE. MORE IDEAS.</p>
            <h3>Good work deserves to be understood.</h3>
            <p>
              Every briefing links to the original project so you can dig deeper
              into what interests you.
            </p>
          </div>
        </aside>
      </div>

      <footer className="footer">
        <a className="logo" href="#top">
          ReadYou<span className="orange">.</span>
        </a>
        <span>Open source, made readable.</span>
        <span>HACKTOBERFEST 2026</span>
      </footer>
    </div>
  );
}

export default App;

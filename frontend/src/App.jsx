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
      currentSection = {
        title: "Project briefing",
        lines: [line.trim()],
      };
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

/*
 * Individual project audio.
 * Uses the existing backend endpoint and cached ElevenLabs files.
 */
function ProjectAudioButton({ project }) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  const audioRef = useRef(null);
  const requestRef = useRef(0);

  function clearAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
      audioRef.current = null;
    }
  }

  useEffect(() => {
    function stopForOtherProject() {
      requestRef.current += 1;
      clearAudio();
      setStatus("idle");
      setMessage("");
    }

    window.addEventListener("readyou-stop-project-audio", stopForOtherProject);

    return () => {
      window.removeEventListener(
        "readyou-stop-project-audio",
        stopForOtherProject,
      );

      requestRef.current += 1;
      clearAudio();
    };
  }, []);

  async function handlePlay() {
    if (status === "loading") return;

    if (status === "playing" && audioRef.current) {
      audioRef.current.pause();
      setStatus("paused");
      setMessage("Paused.");
      return;
    }

    if (status === "paused" && audioRef.current) {
      try {
        await audioRef.current.play();
        setStatus("playing");
        setMessage("Playing this introduction.");
      } catch {
        setStatus("error");
        setMessage("Couldn't resume audio. Try again.");
      }
      return;
    }

    if (!project.submissionUrl || !project.audioIntro) {
      setStatus("error");
      setMessage("Audio introduction isn't available for this project yet.");
      return;
    }

    // Stop any other project before starting this one.
    window.dispatchEvent(new Event("readyou-stop-project-audio"));

    const requestId = ++requestRef.current;

    setStatus("loading");
    setMessage("Preparing audio...");

    try {
      const response = await fetch("/api/audio/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submissionUrl: project.submissionUrl,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success || !result.audioUrl) {
        throw new Error(result.message || "Could not prepare audio.");
      }

      // Ignore responses from playback that was stopped meanwhile.
      if (requestId !== requestRef.current) return;

      const audio = new Audio(result.audioUrl);
      audio.preload = "auto";
      audioRef.current = audio;

      audio.onended = () => {
        if (requestId !== requestRef.current) return;

        audioRef.current = null;
        setStatus("finished");
        setMessage("Finished! Replay whenever you like.");
      };

      audio.onerror = () => {
        if (requestId !== requestRef.current) return;

        audioRef.current = null;
        setStatus("error");
        setMessage("Audio playback failed. Try again.");
      };

      setStatus("playing");
      setMessage("Playing this introduction.");

      await audio.play();
    } catch (error) {
      if (requestId !== requestRef.current) return;

      clearAudio();
      setStatus("error");
      setMessage(error.message || "Audio playback failed.");
    }
  }

  function stopAudio() {
    requestRef.current += 1;
    clearAudio();
    setStatus("idle");
    setMessage("Stopped.");
  }

  return (
    <div className="project-audio">
      <button
        type="button"
        className={`project-audio-button ${status}`}
        onClick={handlePlay}
        disabled={status === "loading"}
        aria-label={`${
          status === "playing"
            ? "Pause"
            : status === "paused"
              ? "Resume"
              : "Listen to"
        } ${project.project?.title || "project introduction"}`}
      >
        {status === "loading"
          ? "◌ Preparing..."
          : status === "playing"
            ? "Ⅱ Pause"
            : status === "paused"
              ? "▶ Resume"
              : status === "finished"
                ? "↻ Replay"
                : status === "error"
                  ? "↻ Try again"
                  : "▶ Listen"}
      </button>

      {(status === "playing" || status === "paused") && (
        <button
          type="button"
          className="project-audio-stop"
          onClick={stopAudio}
        >
          Stop
        </button>
      )}

      {message && (
        <span className="project-audio-status" role="status" aria-live="polite">
          {message}
        </span>
      )}
    </div>
  );
}

/*
 * Listen view: a list of individual project tracks,
 * not one long automatically narrated digest.
 */
function ProjectAudioDirectory({ projects }) {
  const playableProjects = projects.filter(
    (project) =>
      project.status === "completed" &&
      typeof project.audioIntro === "string" &&
      project.audioIntro.trim() &&
      typeof project.submissionUrl === "string" &&
      project.submissionUrl.trim(),
  );

  return (
    <div className="audio-directory">
      <div className="audio-directory-heading">
        <span className="music-icon" aria-hidden="true">
          ♫
        </span>

        <div>
          <p className="eyebrow">THE LISTENING ROOM</p>
          <h3>Pick a project. Press play.</h3>
          <p>Short, friendly introductions. One project at a time.</p>
        </div>

        <span className="audio-count">{playableProjects.length} tracks</span>
      </div>

      {playableProjects.map((project, index) => (
        <article
          className="audio-list-item"
          key={`${project.submissionUrl}-${index}`}
        >
          <span className="audio-track-number">
            {String(index + 1).padStart(2, "0")}
          </span>

          <div className="audio-track-info">
            <h4>{project.project?.title || "Untitled project"}</h4>
            <p>{project.project?.author || "Unknown author"}</p>
          </div>

          <ProjectAudioButton project={project} />
        </article>
      ))}

      {playableProjects.length === 0 && (
        <p className="audio-empty">
          No audio introductions are available for this selection yet.
        </p>
      )}

      <p className="audio-footnote">
        Audio is cached after its first generation. Replaying a track won't
        require another ElevenLabs generation.
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
        if (!controller.signal.aborted) {
          setLoading(false);
        }
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

                              {winner.status === "completed" &&
                                winner.audioIntro &&
                                winner.submissionUrl && (
                                  <ProjectAudioButton project={winner} />
                                )}

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
                  <ProjectAudioDirectory
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

          <div className="hacktoberfest-card">
            <div className="hf-decoration hf-decoration-one">✳</div>
            <div className="hf-decoration hf-decoration-two">✦</div>
            <div className="hf-decoration hf-decoration-three">+</div>

            <div className="hf-topline">
              <span>READYOU</span>
              <span>2026</span>
            </div>

            <div className="hf-sticker">OPEN SOURCE</div>

            <p className="hf-kicker">THE OCTOBER EDITION</p>

            <h3>
              HACKTOBER
              <br />
              <span>FEST.</span>
            </h3>

            <p className="hf-description">
              Cool ideas. Clever code. Projects worth knowing about.
            </p>

            <div className="hf-divider" />

            <div className="hf-footer">
              <div>
                <strong>{projects.length}</strong>
                <span>PROJECTS TO EXPLORE</span>
              </div>

              <a href="#digest" aria-label="Explore the project digest">
                LET'S GO ↗
              </a>
            </div>
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

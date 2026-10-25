import { useEffect, useMemo, useRef, useState } from "react";

const STARTER_QUESTIONS = [
  "What does it do?",
  "How does it work?",
  "What problem does it solve?",
];

function getFollowupSuggestions(answer = "") {
  if (/\b(?:stack|react|node(?:\.js)?|python|framework|library|database|api)\b/i.test(answer)) {
    return [
      { label: "Curious why this stack?", question: "Do the sources explain why they chose this stack?" },
      { label: "How do the parts fit together?", question: "How do the documented parts of this project fit together?" },
    ];
  }
  if (/\b(?:workflow|first|then|step|process|upload|input|output)\b/i.test(answer)) {
    return [
      { label: "Walk me through that", question: "Can you walk me through that workflow in a bit more detail?" },
      { label: "What happens next?", question: "What does the documentation say happens next?" },
    ];
  }
  return [
    { label: "Explore how it works", question: "Want to explore how it works?" },
    { label: "Go a little deeper", question: "Can you go into a little more detail about that?" },
  ];
}

function plainSpeechText(text) {
  return String(text || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[*_`~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeRecordingType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
    .find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export default function VoiceMentor({ projects }) {
  const eligibleProjects = useMemo(
    () => projects.filter((project) => project.status === "completed" && project.submissionUrl),
    [projects],
  );
  const [projectId, setProjectId] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [phase, setPhase] = useState("waiting");
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState("");
  const [speechUrl, setSpeechUrl] = useState("");
  const [speechMessageId, setSpeechMessageId] = useState("");
  const [speechPendingId, setSpeechPendingId] = useState("");
  const [speechError, setSpeechError] = useState("");
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const projectIdRef = useRef("");
  const projectPickerRef = useRef(null);
  const projectPickerTriggerRef = useRef(null);
  const projectSearchRef = useRef(null);
  const projectOptionRefs = useRef([]);
  const recordingAttemptRef = useRef(0);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const submitRecordingRef = useRef(false);
  const recordingTimeoutRef = useRef(null);
  const turnAbortRef = useRef(null);
  const speechAbortRef = useRef(null);
  const audioRef = useRef(null);
  const speechUrlRef = useRef("");
  const autoplayRef = useRef(false);
  const nextMessageIdRef = useRef(0);

  const selectedProject = eligibleProjects.find((project) => project.submissionUrl === projectId);
  const filteredProjects = useMemo(() => {
    const search = projectSearch.trim().toLocaleLowerCase();
    if (!search) return eligibleProjects;
    return eligibleProjects.filter((project) =>
      `${project.project?.title || "Untitled project"} ${project.project?.author || "Unknown author"}`
        .toLocaleLowerCase()
        .includes(search),
    );
  }, [eligibleProjects, projectSearch]);
  const lastAssistantMessage = messages.findLast((message) => message.role === "assistant");
  const followups = getFollowupSuggestions(lastAssistantMessage?.text);
  const statusText = phase === "listening"
    ? "Listening. Tap the mic when you're done."
    : phase === "requesting"
      ? "Waiting for microphone permission…"
    : phase === "thinking"
      ? "Thinking it through…"
      : phase === "speaking"
        ? "Speaking. You can interrupt me with another question."
        : ended
          ? "Session ended. Start fresh when you want to explore again."
          : "I'm here when you're ready.";

  useEffect(() => {
    if (!projectPickerOpen) {
      setProjectSearch("");
      return undefined;
    }
    projectSearchRef.current?.focus();
    const onPointerDown = (event) => {
      if (!projectPickerRef.current?.contains(event.target)) setProjectPickerOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setProjectPickerOpen(false);
        projectPickerTriggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [projectPickerOpen]);

  function moveProjectOptionFocus(event, index) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (index + direction + filteredProjects.length) % filteredProjects.length;
      projectOptionRefs.current[nextIndex]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      projectOptionRefs.current[event.key === "Home" ? 0 : filteredProjects.length - 1]?.focus();
    }
  }

  function clearSpeech() {
    speechAbortRef.current?.abort();
    speechAbortRef.current = null;
    autoplayRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
    if (speechUrlRef.current) URL.revokeObjectURL(speechUrlRef.current);
    speechUrlRef.current = "";
    setSpeechUrl("");
    setSpeechMessageId("");
    setSpeechPendingId("");
    setSpeechError("");
  }

  function stopRecording(shouldSubmit = false) {
    submitRecordingRef.current = shouldSubmit;
    if (recordingTimeoutRef.current) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    if (!shouldSubmit && phase === "listening") setPhase("waiting");
  }

  function interruptCurrentTurn() {
    recordingAttemptRef.current += 1;
    turnAbortRef.current?.abort();
    turnAbortRef.current = null;
    stopRecording(false);
    clearSpeech();
  }

  function resetConversation(nextProjectId = projectId) {
    interruptCurrentTurn();
    projectIdRef.current = nextProjectId;
    setProjectId(nextProjectId);
    setSessionId(null);
    setMessages([]);
    setQuestion("");
    setPhase("waiting");
    setEnded(false);
    setError("");
  }

  useEffect(() => {
    if (projectId && !eligibleProjects.some((project) => project.submissionUrl === projectId)) {
      resetConversation("");
    }
  }, [eligibleProjects, projectId]);

  useEffect(() => () => {
    recordingAttemptRef.current += 1;
    turnAbortRef.current?.abort();
    speechAbortRef.current?.abort();
    if (recordingTimeoutRef.current) window.clearTimeout(recordingTimeoutRef.current);
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioRef.current) audioRef.current.pause();
    if (speechUrlRef.current) URL.revokeObjectURL(speechUrlRef.current);
  }, []);

  useEffect(() => {
    if (!speechUrl || !audioRef.current) return;
    audioRef.current.src = speechUrl;
    if (autoplayRef.current) {
      autoplayRef.current = false;
      audioRef.current.play().catch(() => setPhase("waiting"));
    }
  }, [speechUrl]);

  async function generateSpeech(answer, messageId, autoplay = false) {
    const text = plainSpeechText(answer).slice(0, 1600);
    if (!text) {
      setSpeechError("There's no spoken text in that answer.");
      setPhase("waiting");
      return;
    }
    clearSpeech();
    setPhase("thinking");
    const controller = new AbortController();
    speechAbortRef.current = controller;
    setSpeechPendingId(messageId);
    setSpeechError("");
    autoplayRef.current = autoplay;
    try {
      const response = await fetch("/api/chat/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || "Could not prepare spoken audio.");
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      if (controller.signal.aborted || projectIdRef.current !== projectId) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      speechUrlRef.current = objectUrl;
      setSpeechMessageId(messageId);
      setSpeechUrl(objectUrl);
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setSpeechError(requestError.message || "Spoken audio is unavailable right now.");
        setPhase("waiting");
      }
    } finally {
      if (speechAbortRef.current === controller) {
        speechAbortRef.current = null;
        setSpeechPendingId("");
      }
    }
  }

  async function askProject(questionText, { spoken = false } = {}) {
    const currentQuestion = questionText.trim();
    if (!currentQuestion || !projectIdRef.current || ended) return;
    interruptCurrentTurn();
    const currentProjectId = projectIdRef.current;
    const controller = new AbortController();
    turnAbortRef.current = controller;
    const userId = `user-${nextMessageIdRef.current++}`;
    setError("");
    setQuestion("");
    setPhase("thinking");
    setMessages((current) => [...current, { id: userId, role: "user", text: currentQuestion }]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: currentProjectId,
          question: currentQuestion,
          includeSources: true,
          ...(sessionId ? { sessionId } : {}),
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "I couldn't answer that just now.");
      if (controller.signal.aborted || projectIdRef.current !== currentProjectId) return;
      setSessionId(result.sessionId);
      const messageId = `assistant-${nextMessageIdRef.current++}`;
      setMessages((current) => [...current, {
        id: messageId,
        role: "assistant",
        text: result.answer,
        citations: Array.isArray(result.citations) ? result.citations : [],
      }]);
      if (spoken) {
        await generateSpeech(result.answer, messageId, true);
      } else {
        setPhase("waiting");
      }
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "I couldn't answer that just now.");
        setPhase("waiting");
      }
    } finally {
      if (turnAbortRef.current === controller) turnAbortRef.current = null;
    }
  }

  async function transcribeAndAsk(blob, recordingProjectId) {
    if (!blob.size) {
      setPhase("waiting");
      setError("That recording was empty. Try again or type your question.");
      return;
    }
    if (blob.size > 8 * 1024 * 1024) {
      setPhase("waiting");
      setError("That recording is too large. Try a shorter question.");
      return;
    }
    const controller = new AbortController();
    turnAbortRef.current?.abort();
    turnAbortRef.current = controller;
    setPhase("thinking");
    setError("");
    try {
      const response = await fetch("/api/chat/transcribe", {
        method: "POST",
        headers: { "Content-Type": blob.type || "audio/webm" },
        body: blob,
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Speech recognition failed. Try typing instead.");
      if (controller.signal.aborted || projectIdRef.current !== recordingProjectId) return;
      if (turnAbortRef.current === controller) turnAbortRef.current = null;
      await askProject(result.question, { spoken: true });
    } catch (requestError) {
      if (requestError.name !== "AbortError") {
        setError(requestError.message || "Speech recognition failed. Try typing instead.");
        setPhase("waiting");
      }
    } finally {
      if (turnAbortRef.current === controller) turnAbortRef.current = null;
    }
  }

  async function startRecording() {
    if (!projectId || phase === "thinking" || ended) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording isn't supported here. You can still type your question.");
      return;
    }
    interruptCurrentTurn();
    setError("");
    clearSpeech();
    setPhase("requesting");
    const recordingAttempt = ++recordingAttemptRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (recordingAttemptRef.current !== recordingAttempt || projectIdRef.current !== projectId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = makeRecordingType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      submitRecordingRef.current = false;
      recorder.ondataavailable = (event) => {
        if (event.data?.size) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("The recording stopped unexpectedly. You can type your question instead.");
        setPhase("waiting");
        stopRecording(false);
      };
      recorder.onstop = () => {
        const recording = new Blob(recordingChunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        const shouldSubmit = submitRecordingRef.current;
        recordingChunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop());
        if (mediaRecorderRef.current === recorder) mediaRecorderRef.current = null;
        if (mediaStreamRef.current === stream) mediaStreamRef.current = null;
        if (shouldSubmit && projectIdRef.current === projectId) void transcribeAndAsk(recording, projectId);
        else setPhase("waiting");
      };
      recorder.start();
      setPhase("listening");
      recordingTimeoutRef.current = window.setTimeout(() => stopRecording(true), 45000);
    } catch (recordingError) {
      setPhase("waiting");
      setError(recordingError.name === "NotAllowedError"
        ? "Microphone access was denied. No problem—you can type your question instead."
        : "Couldn't start the microphone. Check your browser settings or type your question.");
    }
  }

  function endSession() {
    interruptCurrentTurn();
    setSessionId(null);
    setEnded(true);
    setPhase("waiting");
  }

  return (
    <section className="voice-mentor" aria-labelledby="voice-mentor-title">
      <div className="voice-mentor-topline">
        <span className="voice-mentor-mark" aria-hidden="true">✳</span>
        <span className="eyebrow">READYOU VOICE MENTOR</span>
      </div>
      <h2 id="voice-mentor-title">Curious about a project?</h2>
      <p className="voice-mentor-intro">Pick one and let's figure it out together.</p>

      {!eligibleProjects.length ? (
        <div className="voice-mentor-empty">
          <span aria-hidden="true">♫</span>
          <p>No project is ready to explore in this selection yet. Choose another week or come back when a briefing is ready.</p>
        </div>
      ) : (
        <>
          <label className="voice-mentor-label" id="voice-mentor-project-label">Choose a project</label>
          <div
            className="voice-mentor-picker"
            ref={projectPickerRef}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setProjectPickerOpen(false);
            }}
          >
            <button
              type="button"
              id="voice-mentor-project"
              ref={projectPickerTriggerRef}
              className="voice-mentor-picker-trigger"
              role="combobox"
              aria-labelledby="voice-mentor-project-label"
              aria-haspopup="listbox"
              aria-expanded={projectPickerOpen}
              aria-controls="voice-mentor-project-options"
              onClick={() => setProjectPickerOpen((open) => !open)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && !projectPickerOpen) {
                  event.preventDefault();
                  setProjectPickerOpen(true);
                }
              }}
            >
              <span className={selectedProject ? "" : "placeholder"}>
                {selectedProject?.project?.title || "Choose a project to talk about…"}
              </span>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
            </button>
            {projectPickerOpen && (
              <div className="voice-mentor-picker-panel">
                <input
                  ref={projectSearchRef}
                  className="voice-mentor-picker-search"
                  type="search"
                  value={projectSearch}
                  onChange={(event) => setProjectSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown" && filteredProjects.length) {
                      event.preventDefault();
                      projectOptionRefs.current[0]?.focus();
                    }
                  }}
                  placeholder={`Find a project (${eligibleProjects.length})`}
                  aria-label="Search projects"
                />
                <div
                  className="voice-mentor-picker-options"
                  id="voice-mentor-project-options"
                  role="listbox"
                  aria-label="Projects"
                >
                  {filteredProjects.map((project, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={project.submissionUrl === projectId}
                      className={`voice-mentor-picker-option${project.submissionUrl === projectId ? " selected" : ""}`}
                      key={project.submissionUrl}
                      ref={(element) => { projectOptionRefs.current[index] = element; }}
                      onKeyDown={(event) => moveProjectOptionFocus(event, index)}
                      onClick={() => {
                        resetConversation(project.submissionUrl);
                        setProjectPickerOpen(false);
                        projectPickerTriggerRef.current?.focus();
                      }}
                    >
                      <span className="voice-mentor-picker-option-title">{project.project?.title || "Untitled project"}</span>
                      <span className="voice-mentor-picker-option-author">{project.project?.author || "Unknown author"}</span>
                      {project.submissionUrl === projectId && <span className="voice-mentor-picker-check" aria-hidden="true">✓</span>}
                    </button>
                  ))}
                  {filteredProjects.length === 0 && (
                    <p className="voice-mentor-picker-empty">No projects match “{projectSearch}”.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {selectedProject ? (
            <>
              <div className="voice-mentor-project">
                <span className="voice-mentor-project-label">ON THE TABLE</span>
                <h3>{selectedProject.project?.title || "Untitled project"}</h3>
                <p>By {selectedProject.project?.author || "Unknown author"}</p>
              </div>

              <div className={`voice-mentor-status ${phase}`} role="status" aria-live="polite">
                <span className="voice-mentor-status-dot" aria-hidden="true" />
                {statusText}
              </div>

              {!messages.length && !ended && (
                <div className="voice-mentor-starters">
                  <p>Try asking</p>
                  {STARTER_QUESTIONS.map((starter) => (
                    <button key={starter} type="button" onClick={() => void askProject(starter)} disabled={phase !== "waiting"}>
                      {starter} <span aria-hidden="true">↗</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="voice-mentor-conversation" aria-live="polite">
                {messages.map((message) => (
                  <article className={`voice-mentor-message ${message.role}`} key={message.id}>
                    <span className="voice-mentor-message-role">{message.role === "user" ? "YOU" : "MENTOR"}</span>
                    <p>{message.text}</p>
                    {message.role === "assistant" && message.citations?.length > 0 && (
                      <details className="voice-mentor-sources">
                        <summary>Sources ({message.citations.length})</summary>
                        <ul>
                          {message.citations.map((citation, index) => (
                            <li key={`${citation.url}-${citation.heading}-${index}`}>
                              <a href={citation.url} target="_blank" rel="noreferrer">
                                {citation.label}{citation.heading ? ` · ${citation.heading}` : ""} ↗
                              </a>
                              <blockquote>{citation.quote}</blockquote>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {message.role === "assistant" && message.id === speechMessageId && (
                      <audio
                        ref={audioRef}
                        className="voice-mentor-audio"
                        controls
                        onPlay={() => setPhase("speaking")}
                        onPause={(event) => {
                          if (!event.currentTarget.ended) setPhase("waiting");
                        }}
                        onEnded={() => setPhase("waiting")}
                      />
                    )}
                    {message.role === "assistant" && message.id === messages.at(-1)?.id && !speechUrl && (
                      <button
                        type="button"
                        className="voice-mentor-speak"
                        onClick={() => void generateSpeech(message.text, message.id, true)}
                        disabled={Boolean(speechPendingId) || phase === "thinking"}
                      >
                        {speechPendingId === message.id ? "Preparing audio…" : "▶ Hear this answer"}
                      </button>
                    )}
                  </article>
                ))}
              </div>

              {messages.length > 0 && !ended && phase === "waiting" && (
                <div className="voice-mentor-followups">
                  {followups.map((followup) => (
                    <button type="button" key={followup.label} onClick={() => void askProject(followup.question)}>
                      {followup.label} ↗
                    </button>
                  ))}
                </div>
              )}

              {error && <p className="voice-mentor-error" role="alert">{error}</p>}
              {speechError && <p className="voice-mentor-error" role="status">{speechError}</p>}

              {ended ? (
                <button type="button" className="voice-mentor-primary" onClick={() => resetConversation(projectId)}>
                  Start a fresh conversation
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className={`voice-mentor-primary${phase === "listening" ? " recording" : ""}`}
                    onClick={() => phase === "listening" ? stopRecording(true) : void startRecording()}
                    disabled={!projectId || phase === "thinking" || phase === "requesting"}
                  >
                    {phase === "listening" ? "Stop & send question" : (
                      <>
                        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" /></svg>
                        {sessionId ? "Ask by voice" : "Start a voice session"}
                      </>
                    )}
                  </button>

                  <form className="voice-mentor-form" onSubmit={(event) => {
                    event.preventDefault();
                    void askProject(question);
                  }}>
                    <label className="voice-mentor-label" htmlFor="voice-mentor-question">Or type it</label>
                    <textarea
                      id="voice-mentor-question"
                      value={question}
                      onChange={(event) => setQuestion(event.target.value)}
                      maxLength={1000}
                      rows={3}
                      placeholder="What makes this project interesting?"
                      disabled={!projectId || phase === "thinking" || phase === "listening" || phase === "requesting"}
                    />
                    <button type="submit" disabled={!question.trim() || !projectId || phase === "thinking" || phase === "listening" || phase === "requesting"}>
                      Ask the mentor ↗
                    </button>
                  </form>

                  {(sessionId || messages.length > 0) && (
                    <div className="voice-mentor-session-actions">
                      <button type="button" onClick={endSession}>End session</button>
                      <button type="button" onClick={() => resetConversation(projectId)}>Start fresh</button>
                    </div>
                  )}
                </>
              )}
              <p className="voice-mentor-privacy">Voice questions are transcribed by ElevenLabs. Answers use ReadYou's source-grounded local model.</p>
            </>
          ) : (
            <div className="voice-mentor-empty">
              <span aria-hidden="true">✳</span>
              <p>Choose a project above and we'll dig into what makes it tick.</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

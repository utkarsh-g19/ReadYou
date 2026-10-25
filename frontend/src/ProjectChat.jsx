import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function ProjectChat({ projectId, projectTitle }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !loading) setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, loading]);

  useEffect(() => {
    if (!loading) {
      setLoadingSeconds(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setLoadingSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  async function submitQuestion(event) {
    event.preventDefault();
    const currentQuestion = question.trim();
    if (!currentQuestion || loading) return;

    setError("");
    setLoading(true);
    setMessages((current) => [
      ...current,
      { role: "user", text: currentQuestion },
    ]);
    setQuestion("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          question: currentQuestion,
          ...(sessionId ? { sessionId } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chat could not be completed.");
      setSessionId(data.sessionId);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: data.answer,
          citations: Array.isArray(data.citations) ? data.citations : [],
        },
      ]);
    } catch (requestError) {
      setError(requestError.message || "Chat could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  function startFresh() {
    setMessages([]);
    setSessionId(null);
    setError("");
  }

  return (
    <>
      <button
        type="button"
        className={`project-chat-trigger${sessionId ? " has-chat" : ""}`}
        onClick={() => setOpen(true)}
        disabled={!projectId}
      >
        {sessionId ? "Continue chatting" : "Ask about this project"} <span aria-hidden="true">↗</span>
      </button>
      {open &&
        createPortal(
          <div
            className="project-chat-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !loading) setOpen(false);
            }}
          >
            <section
              className="project-chat-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="project-chat-title"
            >
              <header className="project-chat-header">
                <div>
                  <span className="project-chat-kicker">SOURCE-GROUNDED CHAT</span>
                  <h3 id="project-chat-title">Ask about {projectTitle}</h3>
                  <p>Answers use the submission and any verified project README.</p>
                </div>
                <button
                  type="button"
                  className="project-chat-close"
                  onClick={() => setOpen(false)}
                  aria-label="Close project chat"
                  disabled={loading}
                >
                  ×
                </button>
              </header>
              <div className="project-chat-messages" aria-live="polite">
                {!messages.length && (
                  <div className="project-chat-empty">
                    <p>Ask about how it works, its tools, or what the documentation leaves unclear.</p>
                    <span>Chat naturally about the project. Ask “sources?” any time to see where an answer came from.</span>
                  </div>
                )}
                {messages.map((message, index) => (
                  <article className={`project-chat-message ${message.role}`} key={`${message.role}-${index}`}>
                    <span className="project-chat-role">{message.role === "user" ? "YOU" : "READYOU"}</span>
                    <p>{message.text}</p>
                    {message.citations?.length > 0 && (
                      <ul className="project-chat-citations">
                        {message.citations.map((citation, citationIndex) => (
                          <li key={`${citation.url}-${citation.heading}-${citationIndex}`}>
                            <a href={citation.url} target="_blank" rel="noreferrer">
                              {citation.label}{citation.heading ? ` · ${citation.heading}` : ""} ↗
                            </a>
                            <blockquote>{citation.quote}</blockquote>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
                {loading && (
                  <p className="project-chat-loading">
                    {loadingSeconds < 2
                      ? "Checking the project sources…"
                      : loadingSeconds < 7
                        ? "Finding the passages that match your question…"
                        : "Still working—preparing an answer from the project evidence…"}
                  </p>
                )}
              </div>
              {error && <p className="project-chat-error" role="alert">{error}</p>}
              <form className="project-chat-form" onSubmit={submitQuestion}>
                <label htmlFor="project-chat-question">Your question</label>
                <div className="project-chat-input-row">
                  <textarea
                    ref={inputRef}
                    id="project-chat-question"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    maxLength={1000}
                    rows={2}
                    placeholder="What problem does it solve?"
                    disabled={loading}
                  />
                  <button type="submit" disabled={!question.trim() || loading}>Ask</button>
                </div>
                <div className="project-chat-form-footer">
                  <span>Only this project's sources are sent to the local model.</span>
                  {messages.length > 0 && (
                    <button type="button" onClick={startFresh} disabled={loading}>Start fresh</button>
                  )}
                </div>
              </form>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  API_BASE_URL,
  InterviewSession,
  SESSION_STORAGE_KEY,
  TranscriptMessage,
  getApiBaseUrl,
  getApiError,
  isInterviewSession,
  isInterviewTurn,
} from "@/lib/interview";

export default function InterviewPage() {
  const router = useRouter();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!savedSession) {
      setIsReady(true);
      return;
    }

    try {
      const parsed: unknown = JSON.parse(savedSession);
      if (isInterviewSession(parsed)) {
        setSession(parsed);
      } else {
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (parseError) {
      if (!(parseError instanceof SyntaxError)) throw parseError;
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (isReady && session?.ended) router.replace("/report");
  }, [isReady, router, session?.ended]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [session?.conversation, isThinking]);

  async function sendAnswer(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!session || session.ended || isThinking) return;

    const answer = draft.trim();
    if (!answer) return;

    setError("");
    setDraft("");
    setIsThinking(true);

    const originalSession = session;
    const candidateMessage: TranscriptMessage = {
      speaker: "candidate",
      message: answer,
    };
    setSession({
      ...session,
      conversation: [...session.conversation, candidateMessage],
    });

    try {
      const response = await fetch(`${getApiBaseUrl()}/interview/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: session.topic,
          difficulty: session.difficulty,
          conversation: session.conversation,
          answer,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, "send your answer"));
      }

      const result: unknown = await response.json();
      if (!isInterviewTurn(result)) {
        throw new Error("The server returned an unexpected response. Please try again.");
      }

      const updatedSession: InterviewSession = {
        ...session,
        conversation: [
          ...session.conversation,
          candidateMessage,
          { speaker: "interviewer", message: result.message },
        ],
        ended: result.ended,
      };
      window.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(updatedSession),
      );
      setSession(updatedSession);
    } catch (requestError) {
      setSession(originalSession);
      setDraft(answer);
      if (requestError instanceof TypeError) {
        setError(
          `Could not reach the backend at ${API_BASE_URL}. Make sure the FastAPI server is running.`,
        );
      } else if (requestError instanceof SyntaxError) {
        setError("The server returned an unexpected response. Please try again.");
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Your answer could not be sent. Please try again.",
        );
      }
    } finally {
      setIsThinking(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void sendAnswer();
    }
  }

  if (!isReady) {
    return (
      <main className="interview-page">
        <div className="ambient-glow" aria-hidden="true" />
        <div className="interview-loading">
          <span className="spinner" aria-hidden="true" />
          Loading your interview
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="interview-page">
        <div className="ambient-glow" aria-hidden="true" />
        <section className="missing-session">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3.5 13.9 10l6.6 2-6.6 2-1.9 6.5L10.1 14l-6.6-2 6.6-2L12 3.5Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <p className="eyebrow">NO ACTIVE SESSION</p>
          <h1>Let&apos;s set up your interview.</h1>
          <p>Start a new session and your first question will be ready here.</p>
          <Link className="start-button back-button" href="/">
            Back to setup
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="interview-page">
      <div className="ambient-glow" aria-hidden="true" />
      <div className="interview-shell chat-shell">
        <header className="site-header">
          <Link className="brand" href="/" aria-label="AI Interview Coach home">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3.5 13.9 10l6.6 2-6.6 2-1.9 6.5L10.1 14l-6.6-2 6.6-2L12 3.5Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>AI Interview Coach</span>
          </Link>
          <Link className="text-link" href="/">
            Exit interview
          </Link>
        </header>

        <section className="chat-content">
          <div className="chat-session-heading">
            <div className="chat-topic">
              <p className="eyebrow">INTERVIEWING ON</p>
              <h1 title={session.topic}>{session.topic}</h1>
            </div>
            <div className="chat-session-badges">
              <span className={`difficulty-badge ${session.difficulty.toLowerCase()}`}>
                {session.difficulty}
              </span>
              <span className="session-status">
                <span className="status-dot" />
                Live session
              </span>
            </div>
          </div>

          <section className="chat-panel" aria-label="Interview conversation">
            <div
              className="chat-transcript"
              role="log"
              aria-label="Interview messages"
              aria-live="polite"
              aria-relevant="additions text"
            >
              {session.conversation.map((message, index) => (
                <article
                  className={`chat-message-row ${message.speaker}`}
                  key={`${index}-${message.speaker}`}
                >
                  {message.speaker === "interviewer" && (
                    <span className="chat-avatar interviewer-avatar" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 3.5 13.9 10l6.6 2-6.6 2-1.9 6.5L10.1 14l-6.6-2 6.6-2L12 3.5Z"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                  <div className="chat-message-content">
                    <span className="chat-speaker">
                      {message.speaker === "interviewer" ? "AI Interviewer" : "You"}
                    </span>
                    <p className="chat-bubble">{message.message}</p>
                  </div>
                  {message.speaker === "candidate" && (
                    <span className="chat-avatar candidate-avatar" aria-hidden="true">
                      YOU
                    </span>
                  )}
                </article>
              ))}
              {isThinking && (
                <div className="chat-message-row interviewer thinking-row" role="status">
                  <span className="chat-avatar interviewer-avatar" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 3.5 13.9 10l6.6 2-6.6 2-1.9 6.5L10.1 14l-6.6-2 6.6-2L12 3.5Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <div className="chat-message-content">
                    <span className="chat-speaker">AI Interviewer</span>
                    <div className="thinking-bubble">
                      <span className="thinking-dots" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      The interviewer is thinking
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {error && (
              <div className="chat-error" role="alert">
                <span aria-hidden="true">!</span>
                {error}
              </div>
            )}

            <form className="chat-composer" onSubmit={sendAnswer}>
              <label className="visually-hidden" htmlFor="answer">
                Your answer
              </label>
              <textarea
                id="answer"
                value={draft}
                maxLength={8_000}
                placeholder="Write your answer..."
                rows={2}
                disabled={isThinking || session.ended}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
              />
              <div className="composer-footer">
                <span>Enter to send <span className="composer-separator">·</span> Shift + Enter for a new line</span>
                <button
                  className="send-button"
                  type="submit"
                  aria-label="Send answer"
                  disabled={!draft.trim() || isThinking || session.ended}
                >
                  {isThinking ? (
                    <span className="spinner" aria-hidden="true" />
                  ) : (
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="M10 15.5v-11m-5 5 5-5 5 5"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </form>
          </section>
          <p className="chat-privacy-note">
            Take your time. The interviewer will respond when you send your answer.
          </p>
        </section>
      </div>
    </main>
  );
}

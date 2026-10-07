"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import {
  API_BASE_URL,
  REPORT_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  Difficulty,
  getApiBaseUrl,
  getApiError,
  isInterviewTurn,
} from "@/lib/interview";

const difficultyOptions: {
  value: Difficulty;
  description: string;
}[] = [
  { value: "Easy", description: "Core concepts" },
  { value: "Medium", description: "Applied thinking" },
  { value: "Hard", description: "Systems & trade-offs" },
];

export default function Home() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "">("");
  const [topicError, setTopicError] = useState("");
  const [difficultyError, setDifficultyError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  async function startInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError("");

    const cleanTopic = topic.trim();
    const nextTopicError = cleanTopic ? "" : "Enter a technical topic to continue.";
    const nextDifficultyError = difficulty
      ? ""
      : "Choose a difficulty to continue.";
    setTopicError(nextTopicError);
    setDifficultyError(nextDifficultyError);

    if (nextTopicError || nextDifficultyError || !difficulty) return;

    setIsStarting(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/interview/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: cleanTopic, difficulty }),
      });

      if (!response.ok) {
        setRequestError(await getApiError(response, "start the interview"));
        return;
      }

      const result: unknown = await response.json();
      if (!isInterviewTurn(result)) {
        setRequestError("The server returned an unexpected response. Please try again.");
        return;
      }

      window.sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          topic: cleanTopic,
          difficulty,
          conversation: [{ speaker: "interviewer", message: result.message }],
          ended: result.ended,
        }),
      );
      window.sessionStorage.removeItem(REPORT_STORAGE_KEY);
      router.push("/interview");
    } catch (error) {
      if (error instanceof TypeError) {
        setRequestError(
          `Could not reach the backend at ${API_BASE_URL}. Make sure the FastAPI server is running.`,
        );
      } else if (error instanceof SyntaxError) {
        setRequestError("The server returned an unexpected response. Please try again.");
      } else {
        setRequestError(
          error instanceof Error
            ? error.message
            : "The interview could not be started. Please try again.",
        );
      }
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <main className="landing-page">
      <div className="ambient-glow" aria-hidden="true" />
      <div className="page-shell">
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
          <span className="header-note">
            <span className="status-dot" />
            YOUR PRIVATE PRACTICE SPACE
          </span>
        </header>

        <section className="landing-content">
          <div className="intro-column">
            <p className="eyebrow">THINK CLEARLY. INTERVIEW CONFIDENTLY.</p>
            <h1>AI Interview Coach</h1>
            <p className="intro-copy">
              A calmer way to get interview-ready. Practice one thoughtful
              question at a time.
            </p>
            <div className="intro-note">
              <span className="note-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="M7 10.5h10M7 14h6m-8 6 3.2-3H17a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v13Z"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span>
                <strong>Built around your goals</strong>
                <span>Choose a topic and meet the moment at your level.</span>
              </span>
            </div>
          </div>

          <section className="setup-card" aria-labelledby="setup-title">
            <div className="card-heading">
              <div>
                <p className="eyebrow">LET&apos;S GET STARTED</p>
                <h2 id="setup-title">Set up your session</h2>
              </div>
              <span className="step-count">01 <span>/ 02</span></span>
            </div>

            <form onSubmit={startInterview} noValidate>
              <div className="form-field">
                <label htmlFor="topic">What would you like to practice?</label>
                <input
                  id="topic"
                  name="topic"
                  type="text"
                  value={topic}
                  maxLength={200}
                  placeholder="e.g. Distributed systems"
                  autoComplete="off"
                  aria-invalid={Boolean(topicError)}
                  aria-describedby={topicError ? "topic-error" : "topic-hint"}
                  onChange={(event) => {
                    setTopic(event.target.value);
                    if (topicError) setTopicError("");
                  }}
                />
                {topicError ? (
                  <p className="field-error" id="topic-error" role="alert">
                    {topicError}
                  </p>
                ) : (
                  <p className="field-hint" id="topic-hint">
                    Pick a focused area, language, or technical concept.
                  </p>
                )}
              </div>

              <fieldset className="difficulty-field">
                <legend>Choose your difficulty</legend>
                <div className="difficulty-options">
                  {difficultyOptions.map((option, index) => (
                    <label
                      className={`difficulty-option${difficulty === option.value ? " selected" : ""}`}
                      key={option.value}
                    >
                      <input
                        type="radio"
                        name="difficulty"
                        value={option.value}
                        checked={difficulty === option.value}
                        aria-describedby={
                          difficultyError ? "difficulty-error" : undefined
                        }
                        onChange={() => {
                          setDifficulty(option.value);
                          setDifficultyError("");
                        }}
                      />
                      <span className="difficulty-index">0{index + 1}</span>
                      <span className="difficulty-name">{option.value}</span>
                      <span className="difficulty-description">
                        {option.description}
                      </span>
                      <span className="difficulty-check" aria-hidden="true">
                        <svg viewBox="0 0 16 16" fill="none">
                          <path
                            d="m3.5 8 3 3 6-6"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </label>
                  ))}
                </div>
                {difficultyError && (
                  <p className="field-error" id="difficulty-error" role="alert">
                    {difficultyError}
                  </p>
                )}
              </fieldset>

              {requestError && (
                <div className="request-error" role="alert">
                  <span aria-hidden="true">!</span>
                  <p>{requestError}</p>
                </div>
              )}

              <button
                className="start-button"
                type="submit"
                disabled={isStarting}
                aria-busy={isStarting}
              >
                {isStarting ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Starting your interview
                  </>
                ) : (
                  <>
                    Start Interview
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path
                        d="M4 10h12m-5-5 5 5-5 5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </>
                )}
              </button>
              <p className="card-footnote">
                Your interview starts as soon as you&apos;re ready.
              </p>
            </form>
          </section>
        </section>

        <footer className="site-footer">
          <span>Made for focused practice.</span>
          <span>Take a breath. You&apos;ve got this.</span>
        </footer>
      </div>
    </main>
  );
}

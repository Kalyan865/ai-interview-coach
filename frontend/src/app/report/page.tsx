"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  API_BASE_URL,
  InterviewSession,
  REPORT_STORAGE_KEY,
  SESSION_STORAGE_KEY,
  getApiError,
  isInterviewSession,
} from "@/lib/interview";

type EvidenceItem = {
  observation: string;
  evidence: string;
};

type InterviewReport = {
  score: number;
  strengths: EvidenceItem[];
  weaknesses: EvidenceItem[];
  topics_to_revise: string[];
  overall_verdict: "excellent" | "good" | "adequate" | "weak";
  pass_fail: "Pass" | "Fail";
};

function isEvidenceItem(value: unknown): value is EvidenceItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "observation" in value &&
    typeof value.observation === "string" &&
    "evidence" in value &&
    typeof value.evidence === "string"
  );
}

function isInterviewReport(value: unknown): value is InterviewReport {
  if (typeof value !== "object" || value === null) return false;
  return (
    "score" in value &&
    typeof value.score === "number" &&
    Number.isInteger(value.score) &&
    value.score >= 0 &&
    value.score <= 100 &&
    "strengths" in value &&
    Array.isArray(value.strengths) &&
    value.strengths.every(isEvidenceItem) &&
    "weaknesses" in value &&
    Array.isArray(value.weaknesses) &&
    value.weaknesses.every(isEvidenceItem) &&
    "topics_to_revise" in value &&
    Array.isArray(value.topics_to_revise) &&
    value.topics_to_revise.every((topic) => typeof topic === "string") &&
    "overall_verdict" in value &&
    ["excellent", "good", "adequate", "weak"].includes(
      String(value.overall_verdict),
    ) &&
    "pass_fail" in value &&
    (value.pass_fail === "Pass" || value.pass_fail === "Fail")
  );
}

export default function ReportPage() {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [report, setReport] = useState<InterviewReport | null>(null);
  const [error, setError] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const requestInFlight = useRef(false);

  const generateReport = useCallback(async (activeSession: InterviewSession) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setIsGenerating(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE_URL}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: activeSession.topic,
          difficulty: activeSession.difficulty,
          conversation: activeSession.conversation,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, "generate the report"));
      }

      const result: unknown = await response.json();
      if (!isInterviewReport(result)) {
        throw new Error("The server returned an unexpected report. Please try again.");
      }

      window.sessionStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(result));
      setReport(result);
    } catch (requestError) {
      if (requestError instanceof TypeError) {
        setError(
          `Could not reach the backend at ${API_BASE_URL}. Make sure the FastAPI server is running.`,
        );
      } else if (requestError instanceof SyntaxError) {
        setError("The server returned an unexpected report. Please try again.");
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The report could not be generated. Please try again.",
        );
      }
    } finally {
      requestInFlight.current = false;
      setIsGenerating(false);
    }
  }, []);

  useEffect(() => {
    const savedSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    const savedReport = window.sessionStorage.getItem(REPORT_STORAGE_KEY);

    if (savedSession) {
      try {
        const parsed: unknown = JSON.parse(savedSession);
        if (isInterviewSession(parsed)) setSession(parsed);
      } catch (parseError) {
        if (!(parseError instanceof SyntaxError)) throw parseError;
        window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }

    if (savedReport) {
      try {
        const parsed: unknown = JSON.parse(savedReport);
        if (isInterviewReport(parsed)) {
          setReport(parsed);
        } else {
          window.sessionStorage.removeItem(REPORT_STORAGE_KEY);
        }
      } catch (parseError) {
        if (!(parseError instanceof SyntaxError)) throw parseError;
        window.sessionStorage.removeItem(REPORT_STORAGE_KEY);
      }
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady || !session?.ended || report) return;
    if (!session.conversation.some((message) => message.speaker === "candidate")) {
      setError("The interview ended before you submitted an answer, so there is no report to score.");
      return;
    }
    void generateReport(session);
  }, [generateReport, isReady, report, session]);

  const scoreTone =
    report?.overall_verdict === "excellent" || report?.overall_verdict === "good"
      ? "good"
      : report?.overall_verdict === "adequate"
        ? "okay"
        : "weak";
  const verdictDescription = report
    ? {
        excellent: "Your answers showed strong command of the topic and clear reasoning.",
        good: "You demonstrated solid understanding, with a few areas to sharpen.",
        adequate: "You showed some understanding, with important concepts to revisit.",
        weak: "Your answers showed foundational gaps to work on before your next interview.",
      }[report.overall_verdict]
    : "";

  if (!isReady) {
    return (
      <main className="interview-page">
        <div className="ambient-glow" aria-hidden="true" />
        <div className="interview-loading">
          <span className="spinner" aria-hidden="true" />
          Preparing your report
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="interview-page">
        <div className="ambient-glow" aria-hidden="true" />
        <section className="missing-session">
          <p className="eyebrow">NO INTERVIEW FOUND</p>
          <h1>Your report will be here.</h1>
          <p>Start an interview to get a personalized performance report.</p>
          <Link className="start-button back-button" href="/">
            Start an interview
          </Link>
        </section>
      </main>
    );
  }

  if (!session.ended) {
    return (
      <main className="interview-page">
        <div className="ambient-glow" aria-hidden="true" />
        <section className="missing-session">
          <p className="eyebrow">INTERVIEW IN PROGRESS</p>
          <h1>Finish your interview first.</h1>
          <p>Your report will be ready after the interviewer wraps up.</p>
          <Link className="start-button back-button" href="/interview">
            Return to interview
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="interview-page report-page">
      <div className="ambient-glow" aria-hidden="true" />
      <div className="interview-shell report-shell">
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
          <Link
            className="text-link"
            href="/"
            onClick={() => {
              window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
              window.sessionStorage.removeItem(REPORT_STORAGE_KEY);
            }}
          >
            New interview
          </Link>
        </header>

        <section className="report-content">
          <div className="report-heading">
            <p className="eyebrow">INTERVIEW COMPLETE</p>
            <h1>Interview Complete</h1>
            <p className="report-subtitle">Your performance report</p>
            <p className="report-topic">
              {session.topic} <span>·</span> {session.difficulty}
            </p>
          </div>

          {isGenerating && !report && (
            <div className="report-loading" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              <span>
                <strong>Reviewing your interview</strong>
                <span>Building a report from your answers...</span>
              </span>
            </div>
          )}

          {error && (
            <div className="report-error" role="alert">
              <p>{error}</p>
              {session.conversation.some((message) => message.speaker === "candidate") && (
                <button
                  className="retry-button"
                  type="button"
                  disabled={isGenerating}
                  onClick={() => void generateReport(session)}
                >
                  Try again
                </button>
              )}
            </div>
          )}

          {report && (
            <>
              <section className="score-card" aria-label="Interview score">
                <div className="score-copy">
                  <p className="eyebrow">YOUR SCORE</p>
                  <div className="score-display">
                    <span className={`score-number ${scoreTone}`}>{report.score}</span>
                    <span className="score-scale">/ 100</span>
                    <span className={`score-quality ${scoreTone}`}>
                      {scoreTone === "okay" ? "Okay" : scoreTone}
                    </span>
                  </div>
                </div>
                <div className={`pass-result ${report.pass_fail.toLowerCase()}`}>
                  <span className="pass-result-label">FINAL RESULT</span>
                  <strong>{report.pass_fail.toUpperCase()}</strong>
                </div>
              </section>

              <div className="report-columns">
                <ReportEvidenceSection
                  title="Strengths"
                  className="strengths"
                  items={report.strengths}
                  emptyMessage="No specific strengths were identified in the responses."
                />
                <ReportEvidenceSection
                  title="Areas for improvement"
                  className="weaknesses"
                  items={report.weaknesses}
                  emptyMessage="No specific gaps were identified in the responses."
                />
              </div>

              <section className="revision-card">
                <div className="report-section-heading">
                  <span className="report-section-icon" aria-hidden="true">
                    ↗
                  </span>
                  <div>
                    <p className="eyebrow">NEXT STEPS</p>
                    <h2>Topics to revise</h2>
                  </div>
                </div>
                {report.topics_to_revise.length ? (
                  <ul className="revision-list">
                    {report.topics_to_revise.map((topic, index) => (
                      <li key={`${topic}-${index}`}>{topic}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-report-note">
                    No specific revision topics were identified.
                  </p>
                )}
              </section>

              <section
                className={`verdict-card verdict-${scoreTone}`}
                aria-labelledby="interviewer-verdict-title"
              >
                <div className="report-section-heading">
                  <span className="report-section-icon" aria-hidden="true">
                    “
                  </span>
                  <div>
                    <p className="eyebrow">INTERVIEWER&apos;S VERDICT</p>
                    <h2 id="interviewer-verdict-title">
                      {report.overall_verdict}
                    </h2>
                  </div>
                </div>
                <p>{verdictDescription}</p>
              </section>

              <Link
                className="start-button report-new-interview"
                href="/"
                onClick={() => {
                  window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
                  window.sessionStorage.removeItem(REPORT_STORAGE_KEY);
                }}
              >
                Start New Interview
              </Link>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function ReportEvidenceSection({
  title,
  className,
  items,
  emptyMessage,
}: {
  title: string;
  className: string;
  items: EvidenceItem[];
  emptyMessage: string;
}) {
  return (
    <section className={`report-list-card ${className}`}>
      <div className="report-section-heading">
        <span className="report-section-icon" aria-hidden="true">
          {className === "strengths" ? "+" : "−"}
        </span>
        <h2>{title}</h2>
      </div>
      {items.length ? (
        <ul className="evidence-list">
          {items.map((item, index) => (
            <li key={`${item.observation}-${index}`}>
              <strong>{item.observation}</strong>
              <blockquote>“{item.evidence}”</blockquote>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-report-note">{emptyMessage}</p>
      )}
    </section>
  );
}

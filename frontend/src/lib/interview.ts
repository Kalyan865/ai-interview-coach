export type Difficulty = "Easy" | "Medium" | "Hard";
export type Speaker = "interviewer" | "candidate";

export type TranscriptMessage = {
  speaker: Speaker;
  message: string;
};

export type InterviewTurn = {
  message: string;
  ended: boolean;
};

export type InterviewSession = {
  topic: string;
  difficulty: Difficulty;
  conversation: TranscriptMessage[];
  ended: boolean;
};

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/+$/, "");

export const SESSION_STORAGE_KEY = "ai-interview-session";
export const REPORT_STORAGE_KEY = "ai-interview-report";

export function isInterviewTurn(value: unknown): value is InterviewTurn {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string" &&
    "ended" in value &&
    typeof value.ended === "boolean"
  );
}

export function isInterviewSession(value: unknown): value is InterviewSession {
  if (typeof value !== "object" || value === null) return false;
  if (!("topic" in value) || typeof value.topic !== "string") return false;
  if (
    !("difficulty" in value) ||
    !["Easy", "Medium", "Hard"].includes(String(value.difficulty))
  ) {
    return false;
  }
  if (!("ended" in value) || typeof value.ended !== "boolean") return false;
  if (!("conversation" in value) || !Array.isArray(value.conversation)) return false;

  return value.conversation.every(
    (message: unknown) =>
      typeof message === "object" &&
      message !== null &&
      "speaker" in message &&
      (message.speaker === "interviewer" || message.speaker === "candidate") &&
      "message" in message &&
      typeof message.message === "string",
  );
}

export async function getApiError(
  response: Response,
  action: string,
): Promise<string> {
  const fallback = `The server could not ${action} (error ${response.status}). Please try again.`;
  try {
    const body: unknown = await response.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      typeof body.detail === "string"
    ) {
      return body.detail;
    }
    if (
      typeof body === "object" &&
      body !== null &&
      "detail" in body &&
      Array.isArray(body.detail)
    ) {
      const messages = body.detail
        .map((item: unknown) => {
          if (
            typeof item === "object" &&
            item !== null &&
            "msg" in item &&
            typeof item.msg === "string"
          ) {
            return item.msg;
          }
          return null;
        })
        .filter((message): message is string => message !== null);
      if (messages.length) return messages.join(" ");
    }
  } catch {
    return fallback;
  }
  return fallback;
}

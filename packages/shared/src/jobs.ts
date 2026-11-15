import type { GenerateQuizInput } from "./schemas.js";

export const QUEUES = {
  /** Delayed jobs that end polls when their timer runs out. Survives server restarts. */
  pollTimers: "poll-timers",
  /** All model-backed work, processed by apps/ai-worker. */
  ai: "ai",
} as const;

export type AiJobPayload =
  | { kind: "ingest-document"; jobId: string; teacherId: string; documentId: string; filePath: string; mime: string }
  | ({ kind: "generate-quiz"; jobId: string; teacherId: string } & GenerateQuizInput)
  | { kind: "poll-insight"; jobId: string; teacherId: string; sessionId: string; pollId: string }
  | { kind: "tutor"; jobId: string; teacherId: string; sessionId: string; participantId: string; question: string }
  | { kind: "assistant"; jobId: string; teacherId: string; sessionId: string; question: string };

export type AiJobKind = AiJobPayload["kind"];

export type Role = "teacher" | "student";

/** Claims stored in the JWT that a socket or HTTP request authenticates with. */
export type AuthClaims =
  | { role: "teacher"; teacherId: string; name: string }
  | { role: "student"; participantId: string; sessionId: string; name: string };

export interface SessionInfo {
  id: string;
  code: string;
  title: string;
  status: "open" | "closed";
  createdAt: string;
}

/** What students see while a poll runs. Never contains the correct answers. */
export interface PublicPoll {
  id: string;
  seq: number;
  question: string;
  options: string[];
  durationSec: number;
  startedAt: string;
  endsAt: string;
}

export interface OptionResult {
  optionIndex: number;
  count: number;
  percentage: number;
}

/** A finished poll, with answers revealed. */
export interface PollResult extends PublicPoll {
  correctOptions: number[];
  explanation: string | null;
  results: OptionResult[];
  totalResponses: number;
  endedAt: string;
}

export interface Participant {
  id: string;
  name: string;
  online: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: Role;
  text: string;
  createdAt: string;
}

export interface PollProgress {
  pollId: string;
  answered: number;
  total: number;
}

/** Full snapshot sent on connect / reconnect, so a refreshed tab resumes exactly where it was. */
export interface SessionSnapshot {
  session: SessionInfo;
  me: { role: Role; id: string; name: string };
  activePoll: PublicPoll | null;
  myAnswer: number | null;
  progress: PollProgress | null;
  lastResult: PollResult | null;
  history: PollResult[];
  participants: Participant[];
  chat: ChatMessage[];
  /** True when AI is on and the teacher attached course material, so students can ask the tutor. */
  tutorAvailable: boolean;
}

export interface AiInsight {
  pollId: string;
  summary: string;
  misconception: string | null;
  followUp: { question: string; options: string[]; correctOptions: number[] } | null;
}

export interface Citation {
  chunkId: string;
  documentTitle: string;
  excerpt: string;
}

export interface QuizQuestionDraft {
  question: string;
  options: string[];
  correctOptions: number[];
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  bloomLevel: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
  concept: string;
  citations: Citation[];
}

export type AiJobStatus = "queued" | "running" | "done" | "failed";

export interface AiJobEvent {
  jobId: string;
  kind: string;
  status: "running" | "done" | "failed";
  /** 0-100 while running, for long jobs like quiz generation. */
  progress?: number;
  message?: string;
  error?: string;
  output?: unknown;
}

export interface TutorAnswer {
  answer: string;
  citations: Citation[];
  strategy: string;
}

export interface QuizDraft {
  questions: QuizQuestionDraft[];
  strategy: string;
  model: string;
}

export interface AiStatus {
  enabled: boolean;
  online: boolean;
  models: { smart: string; fast: string; embed: string };
  missing: string[];
}

export interface DocumentInfo {
  id: string;
  title: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  chunkCount: number;
  conceptCount: number;
  createdAt: string;
}

export interface ConceptGraph {
  nodes: { id: string; name: string; description: string }[];
  edges: { source: string; target: string; relation: string }[];
}

export type Ack<T = undefined> = (res: { ok: true; data?: T } | { ok: false; error: string }) => void;

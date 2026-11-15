import type {
  Ack,
  AiInsight,
  AiJobEvent,
  ChatMessage,
  Participant,
  PollProgress,
  PollResult,
  PublicPoll,
  SessionSnapshot,
} from "./types.js";
import type { PollInput } from "./schemas.js";

/** Events the browser sends. Every payload is validated with the matching Zod schema on the server. */
export interface ClientToServerEvents {
  "session:sync": (ack: Ack<SessionSnapshot>) => void;
  "chat:send": (p: { text: string }, ack: Ack) => void;
  "poll:create": (p: PollInput, ack: Ack<PublicPoll>) => void;
  "poll:answer": (p: { pollId: string; optionIndex: number }, ack: Ack) => void;
  "poll:end": (p: { pollId: string }, ack: Ack) => void;
  "participant:kick": (p: { participantId: string }, ack: Ack) => void;
}

/** Events the server pushes. */
export interface ServerToClientEvents {
  "poll:started": (poll: PublicPoll) => void;
  "poll:progress": (p: PollProgress) => void;
  "poll:ended": (result: PollResult) => void;
  "participants:update": (list: Participant[]) => void;
  "chat:message": (m: ChatMessage) => void;
  "session:kicked": () => void;
  "session:closed": () => void;
  /** Tutor became available / unavailable because the teacher changed the attached material. */
  "session:tutor": (p: { available: boolean }) => void;
  "ai:insight": (insight: AiInsight) => void;
  "ai:job": (p: AiJobEvent) => void;
  /** Streamed text for tutor / assistant answers, so slow local models still feel responsive. */
  "ai:token": (p: { jobId: string; delta: string }) => void;
}

/** Socket.IO room names, shared so the server and the AI worker emit to the same rooms. */
export const rooms = {
  session: (sessionId: string) => `session:${sessionId}`,
  teachers: (sessionId: string) => `session:${sessionId}:teachers`,
  teacher: (teacherId: string) => `teacher:${teacherId}`,
  participant: (participantId: string) => `participant:${participantId}`,
};

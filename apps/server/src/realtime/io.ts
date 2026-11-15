import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import type { ZodType } from "zod";
import {
  AnswerSchema,
  ChatSchema,
  KickSchema,
  PollIdSchema,
  PollInputSchema,
  rooms,
  type Ack,
  type SessionSnapshot,
} from "@classpulse/shared";
import { verifyToken } from "../auth.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { createRedis } from "../redis.js";
import * as chat from "../repo/chat.js";
import { getParticipant, kickParticipant } from "../repo/participants.js";
import * as polls from "../repo/polls.js";
import { getSession, getSessionDocumentIds } from "../repo/sessions.js";
import type { PollService } from "../services/polls.js";
import { broadcastParticipants, participantList } from "./presence.js";
import { TokenBucket } from "./rateLimit.js";
import type { AppSocket, IO } from "./types.js";

export function createIo(httpServer: HttpServer): IO {
  const io: IO = new Server(httpServer, {
    cors: { origin: config.corsOrigins, credentials: true },
    // Lets a client that drops for a few seconds (bad Wi-Fi) resume without missing events.
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });
  io.adapter(createAdapter(createRedis(), createRedis()));

  // Authenticate every socket before it connects.
  io.use(async (socket, next) => {
    try {
      const { token, sessionId } = socket.handshake.auth as { token?: string; sessionId?: string };
      if (!token) return next(new Error("unauthorized"));
      const claims = verifyToken(token);

      if (claims.role === "student") {
        const p = await getParticipant(claims.participantId);
        if (!p || p.session_id !== claims.sessionId) return next(new Error("unauthorized"));
        if (p.kicked_at) return next(new Error("kicked"));
        const session = await getSession(claims.sessionId);
        if (!session || session.status !== "open") return next(new Error("session_closed"));
        socket.data = { claims, sessionId: claims.sessionId };
      } else {
        if (!sessionId) return next(new Error("sessionId required"));
        const session = await getSession(sessionId);
        if (!session || session.teacherId !== claims.teacherId) return next(new Error("forbidden"));
        socket.data = { claims, sessionId };
      }
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  return io;
}

/** Wraps a handler with validation, rate limiting, a role check and a uniform ack shape. */
function handler<T, R>(
  socket: AppSocket,
  opts: { schema: ZodType<T>; bucket?: TokenBucket; teacherOnly?: boolean },
  fn: (input: T) => Promise<R>,
) {
  return async (raw: unknown, ack?: Ack<R>) => {
    const reply: Ack<R> = typeof ack === "function" ? ack : () => {};
    try {
      if (opts.teacherOnly && socket.data.claims.role !== "teacher") {
        return reply({ ok: false, error: "Only the teacher can do that" });
      }
      if (opts.bucket && !opts.bucket.take()) return reply({ ok: false, error: "Slow down" });
      const parsed = opts.schema.safeParse(raw);
      if (!parsed.success) return reply({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" });
      const data = await fn(parsed.data);
      reply({ ok: true, data });
    } catch (err) {
      if (err instanceof polls.PollConflictError) return reply({ ok: false, error: err.message });
      logger.error({ err }, "socket handler failed");
      reply({ ok: false, error: "Something went wrong" });
    }
  };
}

export async function buildSnapshot(io: IO, socket: AppSocket): Promise<SessionSnapshot> {
  const { claims, sessionId } = socket.data;
  const session = await getSession(sessionId);
  if (!session) throw new Error("session vanished");
  const [activePoll, history, participants, messages, docIds] = await Promise.all([
    polls.getActivePoll(sessionId),
    polls.listResults(sessionId),
    participantList(io, sessionId),
    chat.recentMessages(sessionId),
    getSessionDocumentIds(sessionId),
  ]);
  const me =
    claims.role === "teacher"
      ? { role: "teacher" as const, id: claims.teacherId, name: claims.name }
      : { role: "student" as const, id: claims.participantId, name: claims.name };
  const myAnswer = activePoll && claims.role === "student" ? await polls.getMyAnswer(activePoll.id, claims.participantId) : null;
  const progress =
    activePoll && claims.role === "teacher"
      ? await (async () => {
          const respondents = await polls.respondentIds(activePoll.id);
          const online = participants.filter((p) => p.online).map((p) => p.id);
          return { pollId: activePoll.id, answered: respondents.size, total: new Set([...online, ...respondents]).size };
        })()
      : null;
  return {
    session: { id: session.id, code: session.code, title: session.title, status: session.status, createdAt: session.createdAt },
    me,
    activePoll,
    myAnswer,
    progress,
    lastResult: history.at(-1) ?? null,
    history,
    participants,
    chat: messages,
    tutorAvailable: config.aiEnabled && docIds.length > 0,
  };
}

export function registerHandlers(io: IO, pollService: PollService): void {
  io.on("connection", (socket) => {
    const { claims, sessionId } = socket.data;
    // Handlers are registered synchronously, before any await: a client emits "session:sync" the moment
    // it connects, and Socket.IO drops events that arrive before a listener exists.
    const chatBucket = new TokenBucket(5, 0.5); // burst of 5, then 1 message every 2s
    const actionBucket = new TokenBucket(10, 2);

    socket.on("session:sync", async (ack) => {
      try {
        ack({ ok: true, data: await buildSnapshot(io, socket) });
      } catch (err) {
        logger.error({ err }, "sync failed");
        ack({ ok: false, error: "Could not load session" });
      }
    });

    socket.on(
      "chat:send",
      handler(socket, { schema: ChatSchema, bucket: chatBucket }, async ({ text }) => {
        const sender =
          claims.role === "teacher"
            ? { id: claims.teacherId, name: claims.name, role: "teacher" as const }
            : { id: claims.participantId, name: claims.name, role: "student" as const };
        const msg = await chat.addMessage(sessionId, sender, text);
        io.to(rooms.session(sessionId)).emit("chat:message", msg);
        return undefined;
      }),
    );

    socket.on(
      "poll:create",
      handler(socket, { schema: PollInputSchema, bucket: actionBucket, teacherOnly: true }, (input) =>
        pollService.start(sessionId, claims.role === "teacher" ? claims.teacherId : "", input),
      ),
    );

    socket.on(
      "poll:end",
      handler(socket, { schema: PollIdSchema, teacherOnly: true }, async ({ pollId }) => {
        const poll = await polls.getPollRow(pollId);
        if (poll?.session_id !== sessionId) throw new Error("not in this session");
        await pollService.end(pollId);
        return undefined;
      }),
    );

    socket.on(
      "poll:answer",
      handler(socket, { schema: AnswerSchema, bucket: actionBucket }, async ({ pollId, optionIndex }) => {
        if (claims.role !== "student") throw new Error("teachers cannot answer");
        const outcome = await pollService.answer(sessionId, claims.participantId, pollId, optionIndex);
        if (outcome === "duplicate") throw new polls.PollConflictError("You already answered");
        if (outcome === "closed") throw new polls.PollConflictError("This poll has ended");
        if (outcome === "invalid") throw new polls.PollConflictError("Invalid answer");
        return undefined;
      }),
    );

    socket.on(
      "participant:kick",
      handler(socket, { schema: KickSchema, teacherOnly: true }, async ({ participantId }) => {
        if (!(await kickParticipant(sessionId, participantId))) throw new polls.PollConflictError("Participant not found");
        io.to(rooms.participant(participantId)).emit("session:kicked");
        // Give the event a moment to arrive before cutting the connection (works across replicas).
        setTimeout(() => io.in(rooms.participant(participantId)).disconnectSockets(true), 300);
        setTimeout(() => void broadcastParticipants(io, sessionId), 400);
        return undefined;
      }),
    );

    socket.on("disconnect", () => {
      void (async () => {
        await broadcastParticipants(io, sessionId);
        const active = await polls.getActivePoll(sessionId);
        if (active && claims.role === "student") {
          // A student leaving can mean everyone remaining has now answered.
          const { everyoneAnswered } = await pollService.broadcastProgress(sessionId, active.id);
          if (everyoneAnswered) await pollService.end(active.id);
        }
      })().catch((err) => logger.error({ err }, "disconnect cleanup failed"));
    });

    void (async () => {
      await socket.join(rooms.session(sessionId));
      if (claims.role === "teacher") await socket.join([rooms.teachers(sessionId), rooms.teacher(claims.teacherId)]);
      else await socket.join(rooms.participant(claims.participantId));
      await broadcastParticipants(io, sessionId);
    })().catch((err) => logger.error({ err }, "connection setup failed"));
  });
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  AiInsight,
  AiJobEvent,
  ChatMessage,
  ClientToServerEvents,
  Participant,
  PollInput,
  PollProgress,
  PollResult,
  PublicPoll,
  ServerToClientEvents,
  SessionSnapshot,
} from "@classpulse/shared";
import { SERVER_URL } from "./api";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type LiveStatus = "connecting" | "live" | "reconnecting" | "kicked" | "closed" | "error";

export interface LiveState {
  status: LiveStatus;
  error: string | null;
  snapshot: SessionSnapshot | null;
  activePoll: PublicPoll | null;
  myAnswer: number | null;
  progress: PollProgress | null;
  history: PollResult[];
  /** The poll that just ended, shown as a reveal until the next one starts. */
  justEnded: PollResult | null;
  participants: Participant[];
  chat: ChatMessage[];
  insights: Record<string, AiInsight>;
}

const initial: LiveState = {
  status: "connecting",
  error: null,
  snapshot: null,
  activePoll: null,
  myAnswer: null,
  progress: null,
  history: [],
  justEnded: null,
  participants: [],
  chat: [],
  insights: {},
};

type AiListener = { job?: (e: AiJobEvent) => void; token?: (p: { jobId: string; delta: string }) => void };

/**
 * One Socket.IO connection per live session, for teachers and students alike. On every (re)connect
 * it asks for a full snapshot, so a refreshed tab or flaky Wi-Fi resumes exactly where it was.
 */
export function useLive(auth: { token: string; sessionId?: string } | null) {
  const [state, setState] = useState<LiveState>(initial);
  const socketRef = useRef<AppSocket | null>(null);
  const aiListeners = useRef(new Set<AiListener>());

  useEffect(() => {
    if (!auth) return;
    const socket: AppSocket = io(SERVER_URL, {
      auth: { token: auth.token, sessionId: auth.sessionId },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    const patch = (fn: (s: LiveState) => Partial<LiveState>) => setState((s) => ({ ...s, ...fn(s) }));

    // Ask for a full snapshot; retry if the server doesn't answer (e.g. it was busy or restarting).
    const sync = (attempt = 0): void =>
      void socket.timeout(5000).emit("session:sync", (err, res) => {
        if (err) {
          if (socket.connected && attempt < 5) sync(attempt + 1);
          return;
        }
        if (!res.ok || !res.data) return patch(() => ({ status: "error", error: res.ok ? "Empty snapshot" : res.error }));
        const snap = res.data;
        patch((s) => ({
          status: snap.session.status === "closed" ? "closed" : "live",
          error: null,
          snapshot: snap,
          activePoll: snap.activePoll,
          myAnswer: snap.myAnswer,
          progress: snap.progress,
          history: snap.history,
          justEnded: snap.activePoll ? null : (s.justEnded ?? null),
          participants: snap.participants,
          chat: snap.chat,
        }));
      });

    socket.on("connect", () => sync());
    socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect") patch((s) => (s.status === "live" ? { status: "reconnecting" } : {}));
    });
    socket.on("connect_error", (err) => {
      if (err.message === "kicked") patch(() => ({ status: "kicked" }));
      else if (err.message === "session_closed") patch(() => ({ status: "closed" }));
      else if (err.message === "unauthorized" || err.message === "forbidden")
        patch(() => ({ status: "error", error: "Your login for this session is no longer valid." }));
      else patch((s) => ({ status: s.snapshot ? "reconnecting" : "connecting" }));
      if (["kicked", "session_closed", "unauthorized", "forbidden"].includes(err.message)) socket.disconnect();
    });
    socket.on("poll:started", (poll) =>
      patch(() => ({ activePoll: poll, myAnswer: null, justEnded: null, progress: { pollId: poll.id, answered: 0, total: 0 } })),
    );
    socket.on("poll:progress", (progress) => patch(() => ({ progress })));
    socket.on("poll:ended", (result) =>
      patch((s) => ({
        activePoll: s.activePoll?.id === result.id ? null : s.activePoll,
        justEnded: result,
        progress: null,
        history: [...s.history.filter((h) => h.id !== result.id), result].sort((a, b) => a.seq - b.seq),
      })),
    );
    socket.on("participants:update", (participants) => patch(() => ({ participants })));
    socket.on("chat:message", (m) => patch((s) => (s.chat.some((c) => c.id === m.id) ? {} : { chat: [...s.chat, m].slice(-200) })));
    socket.on("session:kicked", () => patch(() => ({ status: "kicked" })));
    socket.on("session:closed", () => patch(() => ({ status: "closed" })));
    socket.on("session:tutor", ({ available }) => patch((s) => (s.snapshot ? { snapshot: { ...s.snapshot, tutorAvailable: available } } : {})));
    socket.on("ai:insight", (insight) => patch((s) => ({ insights: { ...s.insights, [insight.pollId]: insight } })));
    socket.on("ai:job", (e) => aiListeners.current.forEach((l) => l.job?.(e)));
    socket.on("ai:token", (p) => aiListeners.current.forEach((l) => l.token?.(p)));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setState(initial);
    };
  }, [auth?.token, auth?.sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const call = useCallback(<K extends keyof ClientToServerEvents>(event: K, payload: unknown) => {
    return new Promise<{ ok: boolean; error?: string; data?: unknown }>((resolve) => {
      const s = socketRef.current;
      if (!s?.connected) return resolve({ ok: false, error: "You're offline. Reconnecting…" });
      const timer = setTimeout(() => resolve({ ok: false, error: "The server didn't respond. Try again." }), 8000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s.emit as any)(event, payload, (res: { ok: boolean; error?: string; data?: unknown }) => {
        clearTimeout(timer);
        resolve(res);
      });
    });
  }, []);

  const actions = useMemo(
    () => ({
      createPoll: (p: PollInput) => call("poll:create", p),
      endPoll: (pollId: string) => call("poll:end", { pollId }),
      answer: async (pollId: string, optionIndex: number) => {
        setState((s) => ({ ...s, myAnswer: optionIndex }));
        const res = await call("poll:answer", { pollId, optionIndex });
        if (!res.ok && res.error !== "You already answered") setState((s) => ({ ...s, myAnswer: null }));
        return res;
      },
      kick: (participantId: string) => call("participant:kick", { participantId }),
      sendChat: (text: string) => call("chat:send", { text }),
      setInsights: (list: AiInsight[]) =>
        setState((s) => ({ ...s, insights: { ...Object.fromEntries(list.map((i) => [i.pollId, i])), ...s.insights } })),
      onAi: (l: AiListener) => {
        aiListeners.current.add(l);
        return () => void aiListeners.current.delete(l);
      },
    }),
    [call],
  );

  return { state, actions };
}

export type LiveActions = ReturnType<typeof useLive>["actions"];

/** Seconds left until `endsAt`, ticking every 250ms. */
export function useCountdown(endsAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1000));
}

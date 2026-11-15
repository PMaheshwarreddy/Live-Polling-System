import { useCallback, useEffect, useRef, useState } from "react";
import type { AiJobEvent } from "@classpulse/shared";
import { api } from "./api";
import type { LiveActions } from "./live";

export interface AiJobState<T> {
  jobId: string | null;
  status: "idle" | "queued" | "running" | "done" | "failed";
  progress: number;
  message: string;
  /** Streamed text (tutor, assistant). */
  text: string;
  /** Items streamed while running (quiz questions arrive one by one). */
  partials: unknown[];
  output: T | null;
  error: string | null;
}

const idle: AiJobState<never> = { jobId: null, status: "idle", progress: 0, message: "", text: "", partials: [], output: null, error: null };

/**
 * Tracks one AI job end to end. Events can arrive before the HTTP call that created the job has
 * returned its id, so everything is buffered until the id is known. A slow poll covers missed events.
 */
export function useAiJob<T = unknown>(onAi: LiveActions["onAi"] | null, token: string | null) {
  const [state, setState] = useState<AiJobState<T>>(idle);
  const jobId = useRef<string | null>(null);
  const buffer = useRef<{ type: "job" | "token"; jobId: string; e: AiJobEvent | { delta: string } }[]>([]);

  const apply = useCallback((type: "job" | "token", e: AiJobEvent | { delta: string }) => {
    setState((s) => {
      if (type === "token") return { ...s, status: "running", text: s.text + (e as { delta: string }).delta };
      const ev = e as AiJobEvent;
      if (ev.status === "running")
        return {
          ...s,
          status: "running",
          progress: ev.progress ?? s.progress,
          message: ev.message ?? s.message,
          partials: ev.output ? [...s.partials, ev.output] : s.partials,
        };
      if (ev.status === "done") return { ...s, status: "done", progress: 100, output: ev.output as T };
      return { ...s, status: "failed", error: ev.error ?? "The AI job failed" };
    });
  }, []);

  useEffect(() => {
    if (!onAi) return;
    return onAi({
      job: (e) => {
        if (jobId.current === e.jobId) apply("job", e);
        else if (!jobId.current) buffer.current.push({ type: "job", jobId: e.jobId, e });
      },
      token: (p) => {
        if (jobId.current === p.jobId) apply("token", p);
        else if (!jobId.current) buffer.current.push({ type: "token", jobId: p.jobId, e: p });
      },
    });
  }, [onAi, apply]);

  // Fallback: if a socket event was missed (tab asleep, reconnect), read the result from the API.
  useEffect(() => {
    if (!state.jobId || !token || (state.status !== "queued" && state.status !== "running")) return;
    const t = setInterval(async () => {
      try {
        const j = await api<{ status: string; output: T; error: string | null }>(`/api/ai/jobs/${state.jobId}`, { token });
        if (j.status === "done")
          setState((s) => (s.status === "done" ? s : { ...s, status: "done", progress: 100, output: j.output }));
        if (j.status === "failed") setState((s) => ({ ...s, status: "failed", error: j.error ?? "The AI job failed" }));
      } catch {
        /* keep waiting */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [state.jobId, state.status, token]);

  const start = useCallback(
    async (create: () => Promise<{ jobId: string }>) => {
      jobId.current = null;
      buffer.current = [];
      setState({ ...idle, status: "queued", message: "Waiting for the local model…" });
      try {
        const { jobId: id } = await create();
        jobId.current = id;
        setState((s) => ({ ...s, jobId: id }));
        for (const b of buffer.current) if (b.jobId === id) apply(b.type, b.e);
        buffer.current = [];
      } catch (err) {
        setState({ ...idle, status: "failed", error: err instanceof Error ? err.message : String(err) });
      }
    },
    [apply],
  );

  const reset = useCallback(() => {
    jobId.current = null;
    setState(idle);
  }, []);

  return { ...state, start, reset, busy: state.status === "queued" || state.status === "running" };
}

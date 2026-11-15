import { Queue } from "bullmq";
import { QUEUES, type AiJobPayload } from "@classpulse/shared";
import { config } from "../config.js";
import { query, queryOne } from "../db.js";
import { HttpError } from "../http/errors.js";
import { createRedis } from "../redis.js";

let queue: Queue<AiJobPayload> | null = null;
function aiQueue(): Queue<AiJobPayload> {
  queue ??= new Queue<AiJobPayload>(QUEUES.ai, { connection: createRedis() });
  return queue;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewAiJob = DistributiveOmit<AiJobPayload, "jobId">;

const PRIORITY: Record<AiJobPayload["kind"], number> = {
  tutor: 1,
  "poll-insight": 2,
  assistant: 2,
  "ingest-document": 5,
  "generate-quiz": 5,
};

export async function jobsToday(teacherId: string): Promise<number> {
  const row = await queryOne<{ n: string }>(
    "SELECT count(*) AS n FROM ai_jobs WHERE teacher_id = $1 AND created_at >= date_trunc('day', now())",
    [teacherId],
  );
  return Number(row?.n ?? 0);
}

export function assertAiEnabled(): void {
  if (!config.aiEnabled) throw new HttpError(503, "AI features are turned off on this server (AI_ENABLED=false)");
}

/** Records the job in Postgres (so its result can be fetched later) and hands it to the AI worker. */
export async function enqueueAiJob(job: NewAiJob, opts: { participantId?: string } = {}): Promise<string> {
  assertAiEnabled();
  if ((await jobsToday(job.teacherId)) >= config.AI_DAILY_JOBS_PER_TEACHER) {
    throw new HttpError(429, "Daily AI limit reached for this class. It resets at midnight.");
  }
  const row = await queryOne<{ id: string }>(
    "INSERT INTO ai_jobs (teacher_id, participant_id, kind, input) VALUES ($1, $2, $3, $4) RETURNING id",
    [job.teacherId, opts.participantId ?? null, job.kind, JSON.stringify(job)],
  );
  const jobId = row!.id;
  await aiQueue().add(job.kind, { ...job, jobId } as AiJobPayload, {
    jobId,
    // Students waiting on the tutor go ahead of long background jobs like quiz generation.
    priority: PRIORITY[job.kind],
    attempts: job.kind === "ingest-document" ? 2 : 1,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  });
  return jobId;
}

export async function getAiJob(jobId: string) {
  return queryOne<{
    id: string;
    teacher_id: string | null;
    participant_id: string | null;
    kind: string;
    status: string;
    output: unknown;
    error: string | null;
  }>("SELECT id, teacher_id, participant_id, kind, status, output, error FROM ai_jobs WHERE id = $1", [jobId]);
}

export async function usageSummary(teacherId: string) {
  const byFeature = await query<{ feature: string; model: string; calls: string; avg_ms: string; input: string; output: string; failed: string }>(
    `SELECT feature, model, count(*) AS calls, avg(latency_ms) AS avg_ms,
            sum(input_tokens) AS input, sum(output_tokens) AS output, count(*) FILTER (WHERE NOT ok) AS failed
     FROM ai_calls WHERE teacher_id = $1 AND created_at >= now() - interval '30 days'
     GROUP BY feature, model ORDER BY calls DESC`,
    [teacherId],
  );
  return {
    dailyJobLimit: config.AI_DAILY_JOBS_PER_TEACHER,
    jobsToday: await jobsToday(teacherId),
    byFeature: byFeature.map((r) => ({
      feature: r.feature,
      model: r.model,
      calls: Number(r.calls),
      failed: Number(r.failed),
      avgLatencyMs: Math.round(Number(r.avg_ms)),
      inputTokens: Number(r.input),
      outputTokens: Number(r.output),
    })),
  };
}

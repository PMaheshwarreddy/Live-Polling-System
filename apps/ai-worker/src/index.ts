import { Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import pg from "pg";
import pino from "pino";
import { Emitter } from "@socket.io/redis-emitter";
import {
  QUEUES,
  rooms,
  tallyResults,
  type AiJobEvent,
  type AiJobPayload,
  type PollResult,
  type ServerToClientEvents,
} from "@classpulse/shared";
import {
  Ollama,
  Retriever,
  answerAsTutor,
  askAssistant,
  generateQuiz,
  ingestText,
  pollInsight,
  readDocument,
  type LlmCall,
} from "@classpulse/rag-core";
import { classSummary } from "./classSummary.js";
import { config } from "./config.js";

const logger = pino({ base: { service: "ai-worker" } });
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 5 });
const emitter = new Emitter<ServerToClientEvents>(new Redis(config.REDIS_URL));

/** Where a job's live events go: tutor answers to that one student, everything else to the teacher. */
function target(job: AiJobPayload) {
  if (job.kind === "tutor") return emitter.to(rooms.participant(job.participantId));
  if (job.kind === "poll-insight") return emitter.to(rooms.teachers(job.sessionId));
  return emitter.to(rooms.teacher(job.teacherId));
}

async function setStatus(jobId: string, status: string, fields: { output?: unknown; error?: string } = {}) {
  await pool.query("UPDATE ai_jobs SET status = $2, output = coalesce($3, output), error = $4, updated_at = now() WHERE id = $1", [
    jobId,
    status,
    fields.output === undefined ? null : JSON.stringify(fields.output),
    fields.error ?? null,
  ]);
}

function toolsFor(job: AiJobPayload) {
  const llm = new Ollama(config.OLLAMA_URL, (c: LlmCall) => {
    pool
      .query(
        `INSERT INTO ai_calls (teacher_id, feature, model, input_tokens, output_tokens, latency_ms, ok, error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [job.teacherId, c.feature, c.model, c.inputTokens, c.outputTokens, c.latencyMs, c.ok, c.error ?? null],
      )
      .catch((err) => logger.warn({ err }, "could not record ai call"));
  }, { numThread: config.OLLAMA_NUM_THREAD });
  const retriever = new Retriever({ db: pool, llm, models: config.models });
  return { llm, retriever, models: config.models, db: pool, pool };
}

async function sessionDocIds(sessionId: string): Promise<string[]> {
  const { rows } = await pool.query<{ document_id: string }>(
    `SELECT sd.document_id FROM session_documents sd JOIN documents d ON d.id = sd.document_id
     WHERE sd.session_id = $1 AND d.status = 'ready'`,
    [sessionId],
  );
  return rows.map((r) => r.document_id);
}

async function loadPollResult(pollId: string): Promise<PollResult | null> {
  const { rows } = await pool.query("SELECT * FROM polls WHERE id = $1 AND ended_at IS NOT NULL", [pollId]);
  const p = rows[0];
  if (!p) return null;
  const { rows: answers } = await pool.query<{ option_index: number }>("SELECT option_index FROM responses WHERE poll_id = $1", [pollId]);
  return {
    id: p.id,
    seq: p.seq,
    question: p.question,
    options: p.options,
    durationSec: p.duration_sec,
    startedAt: p.started_at.toISOString(),
    endsAt: p.ends_at.toISOString(),
    correctOptions: p.correct_options,
    explanation: p.explanation,
    results: tallyResults(p.options.length, answers.map((a) => a.option_index)),
    totalResponses: answers.length,
    endedAt: p.ended_at.toISOString(),
  };
}

async function run(job: Job<AiJobPayload>): Promise<unknown> {
  const data = job.data;
  const room = target(data);
  const event = (e: Omit<AiJobEvent, "jobId" | "kind">) => room.emit("ai:job", { jobId: data.jobId, kind: data.kind, ...e });
  const progress = (pct: number, message: string) => event({ status: "running", progress: pct, message });
  const tools = toolsFor(data);

  await setStatus(data.jobId, "running");
  progress(0, "Starting");

  switch (data.kind) {
    case "ingest-document": {
      const { rows } = await pool.query<{ title: string }>("SELECT title FROM documents WHERE id = $1", [data.documentId]);
      if (!rows[0]) return { skipped: "document deleted" };
      try {
        progress(5, "Reading file");
        const text = await readDocument(data.filePath, data.mime);
        const out = await ingestText(tools, data.documentId, rows[0].title, text, progress);
        await pool.query("UPDATE documents SET status = 'ready', error = NULL WHERE id = $1", [data.documentId]);
        return out;
      } catch (err) {
        await pool.query("UPDATE documents SET status = 'failed', error = $2 WHERE id = $1", [data.documentId, (err as Error).message]);
        throw err;
      }
    }

    case "generate-quiz": {
      return generateQuiz(tools, {
        docIds: [data.documentId],
        topic: data.topic || undefined,
        count: data.count,
        difficulty: data.difficulty,
        strategy: data.strategy ?? config.RAG_STRATEGY,
        // Stream each finished question so the teacher sees results before the whole quiz is done.
        onProgress: (pct, message, question) => room.emit("ai:job", { jobId: data.jobId, kind: data.kind, status: "running", progress: pct, message, output: question }),
      });
    }

    case "tutor": {
      const docIds = await sessionDocIds(data.sessionId);
      const out = await answerAsTutor(tools, {
        question: data.question,
        docIds,
        strategy: config.RAG_STRATEGY,
        onToken: (delta) => room.emit("ai:token", { jobId: data.jobId, delta }),
      });
      return out;
    }

    case "assistant": {
      const summary = await classSummary(pool, data.sessionId);
      const docIds = await sessionDocIds(data.sessionId);
      let material: string | undefined;
      if (docIds.length) {
        const { hits } = await tools.retriever.retrieve(data.question, docIds, "hybrid", 2);
        material = hits.map((h) => h.parentContent).join("\n\n") || undefined;
      }
      const answer = await askAssistant(tools, {
        question: data.question,
        classSummary: summary,
        material,
        onToken: (delta) => room.emit("ai:token", { jobId: data.jobId, delta }),
      });
      return { answer };
    }

    case "poll-insight": {
      const poll = await loadPollResult(data.pollId);
      if (!poll) return { skipped: "poll not found" };
      const insight = await pollInsight(tools, poll);
      await pool.query(
        "INSERT INTO poll_insights (poll_id, insight) VALUES ($1, $2) ON CONFLICT (poll_id) DO UPDATE SET insight = EXCLUDED.insight",
        [data.pollId, JSON.stringify(insight)],
      );
      emitter.to(rooms.teachers(data.sessionId)).emit("ai:insight", insight);
      return insight;
    }
  }
}

const worker = new Worker<AiJobPayload>(
  QUEUES.ai,
  async (job) => {
    // A job can be handed out again if the worker lost its lock (e.g. the laptop slept mid-job).
    // Never run finished work twice: a student would get the same tutor answer streamed again.
    const { rows } = await pool.query<{ status: string }>("SELECT status FROM ai_jobs WHERE id = $1", [job.data.jobId]);
    if (rows[0] && (rows[0].status === "done" || rows[0].status === "failed")) return;
    const started = Date.now();
    const output = await run(job);
    await setStatus(job.data.jobId, "done", { output });
    target(job.data).emit("ai:job", { jobId: job.data.jobId, kind: job.data.kind, status: "done", progress: 100, output });
    logger.info({ jobId: job.data.jobId, kind: job.data.kind, ms: Date.now() - started }, "job done");
  },
  {
    connection: new Redis(config.REDIS_URL, { maxRetriesPerRequest: null }),
    concurrency: config.AI_WORKER_CONCURRENCY,
    // Local model calls can take minutes on a CPU; give the job lock room so it isn't declared stalled.
    lockDuration: 5 * 60_000,
  },
);

worker.on("failed", (job, err) => {
  if (!job) return;
  const final = job.attemptsMade >= (job.opts.attempts ?? 1);
  logger.error({ jobId: job.data.jobId, kind: job.data.kind, err: err.message, final }, "job failed");
  if (!final) return;
  void setStatus(job.data.jobId, "failed", { error: err.message });
  target(job.data).emit("ai:job", { jobId: job.data.jobId, kind: job.data.kind, status: "failed", error: err.message });
});

logger.info({ ollama: config.OLLAMA_URL, models: config.models, strategy: config.RAG_STRATEGY }, "AI worker ready");

async function shutdown() {
  await worker.close();
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

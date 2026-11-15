import type { PoolClient } from "pg";
import { tallyResults, type PollInput, type PollResult, type PublicPoll } from "@classpulse/shared";
import { query, queryOne, tx } from "../db.js";

interface PollRow {
  id: string;
  session_id: string;
  seq: number;
  question: string;
  options: string[];
  correct_options: number[];
  explanation: string | null;
  duration_sec: number;
  document_id: string | null;
  started_at: Date;
  ends_at: Date;
  ended_at: Date | null;
}

export class PollConflictError extends Error {}

export const toPublicPoll = (r: PollRow): PublicPoll => ({
  id: r.id,
  seq: r.seq,
  question: r.question,
  options: r.options,
  durationSec: r.duration_sec,
  startedAt: r.started_at.toISOString(),
  endsAt: r.ends_at.toISOString(),
});

export async function createPoll(sessionId: string, input: PollInput): Promise<PublicPoll> {
  try {
    const row = await tx(async (c: PoolClient) => {
      // Lock the session row so two "create" calls can't pick the same seq.
      await c.query("SELECT 1 FROM sessions WHERE id = $1 FOR UPDATE", [sessionId]);
      const { rows } = await c.query<PollRow>(
        `INSERT INTO polls (session_id, seq, question, options, correct_options, explanation, duration_sec, document_id, ends_at)
         VALUES ($1, (SELECT coalesce(max(seq), 0) + 1 FROM polls WHERE session_id = $1),
                 $2, $3, $4, $5, $6::int, $7, now() + make_interval(secs => $6::int))
         RETURNING *`,
        [
          sessionId,
          input.question,
          JSON.stringify(input.options),
          input.correctOptions,
          input.explanation ?? null,
          input.durationSec,
          input.documentId ?? null,
        ],
      );
      return rows[0]!;
    });
    return toPublicPoll(row);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new PollConflictError("A poll is already running in this session");
    }
    throw err;
  }
}

export async function getActivePoll(sessionId: string): Promise<PublicPoll | null> {
  const row = await queryOne<PollRow>(
    "SELECT * FROM polls WHERE session_id = $1 AND ended_at IS NULL",
    [sessionId],
  );
  return row ? toPublicPoll(row) : null;
}

export const getPollRow = (id: string) => queryOne<PollRow>("SELECT * FROM polls WHERE id = $1", [id]);

export type AnswerOutcome = "ok" | "duplicate" | "closed" | "invalid";

export async function recordAnswer(
  pollId: string,
  sessionId: string,
  participantId: string,
  optionIndex: number,
): Promise<AnswerOutcome> {
  const poll = await queryOne<PollRow>("SELECT * FROM polls WHERE id = $1 AND session_id = $2", [pollId, sessionId]);
  if (!poll) return "invalid";
  if (poll.ended_at || poll.ends_at.getTime() < Date.now()) return "closed";
  if (optionIndex >= poll.options.length) return "invalid";
  const rows = await query(
    `INSERT INTO responses (poll_id, participant_id, option_index) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING RETURNING poll_id`,
    [pollId, participantId, optionIndex],
  );
  return rows.length ? "ok" : "duplicate";
}

export async function countResponses(pollId: string): Promise<number> {
  const row = await queryOne<{ n: string }>("SELECT count(*) AS n FROM responses WHERE poll_id = $1", [pollId]);
  return Number(row?.n ?? 0);
}

export async function respondentIds(pollId: string): Promise<Set<string>> {
  const rows = await query<{ participant_id: string }>("SELECT participant_id FROM responses WHERE poll_id = $1", [pollId]);
  return new Set(rows.map((r) => r.participant_id));
}

export async function getMyAnswer(pollId: string, participantId: string): Promise<number | null> {
  const row = await queryOne<{ option_index: number }>(
    "SELECT option_index FROM responses WHERE poll_id = $1 AND participant_id = $2",
    [pollId, participantId],
  );
  return row?.option_index ?? null;
}

async function buildResult(row: PollRow): Promise<PollResult> {
  const answers = await query<{ option_index: number }>(
    "SELECT option_index FROM responses WHERE poll_id = $1",
    [row.id],
  );
  const results = tallyResults(row.options.length, answers.map((a) => a.option_index));
  return {
    ...toPublicPoll(row),
    correctOptions: row.correct_options,
    explanation: row.explanation,
    results,
    totalResponses: answers.length,
    endedAt: (row.ended_at ?? new Date()).toISOString(),
  };
}

/**
 * Ends a poll. Idempotent and race-safe: when the timer job, the "everyone answered" check and the
 * teacher's "end now" button all fire together, exactly one caller gets the result back.
 */
export async function endPoll(pollId: string): Promise<{ result: PollResult; sessionId: string } | null> {
  const row = await queryOne<PollRow>(
    "UPDATE polls SET ended_at = now() WHERE id = $1 AND ended_at IS NULL RETURNING *",
    [pollId],
  );
  if (!row) return null;
  return { result: await buildResult(row), sessionId: row.session_id };
}

export async function listResults(sessionId: string): Promise<PollResult[]> {
  const rows = await query<PollRow>(
    "SELECT * FROM polls WHERE session_id = $1 AND ended_at IS NOT NULL ORDER BY seq",
    [sessionId],
  );
  return Promise.all(rows.map(buildResult));
}

/** Polls whose timer passed while no server was running to end them (used on startup). */
export const findOverduePolls = () =>
  query<{ id: string }>("SELECT id FROM polls WHERE ended_at IS NULL AND ends_at < now()");

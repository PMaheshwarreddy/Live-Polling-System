import { Queue, Worker } from "bullmq";
import { QUEUES, rooms, type PollInput, type PublicPoll } from "@classpulse/shared";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { createRedis } from "../redis.js";
import * as polls from "../repo/polls.js";
import { getSession } from "../repo/sessions.js";
import type { IO } from "../realtime/types.js";
import { onlineStudentIds } from "../realtime/presence.js";
import { enqueueAiJob } from "./aiJobs.js";

/**
 * Owns the poll lifecycle. Timers are BullMQ delayed jobs in Redis rather than setTimeout,
 * so a poll still ends on time if the server restarts or another replica picks the job up.
 */
export class PollService {
  private timers: Queue<{ pollId: string }>;
  private worker: Worker<{ pollId: string }>;

  constructor(private io: IO) {
    this.timers = new Queue(QUEUES.pollTimers, { connection: createRedis() });
    this.worker = new Worker<{ pollId: string }>(
      QUEUES.pollTimers,
      async (job) => {
        await this.end(job.data.pollId);
      },
      { connection: createRedis() },
    );
    this.worker.on("failed", (job, err) => logger.error({ err, pollId: job?.data.pollId }, "poll timer failed"));
  }

  async start(sessionId: string, teacherId: string, input: PollInput): Promise<PublicPoll> {
    const poll = await polls.createPoll(sessionId, input);
    await this.timers.add("end", { pollId: poll.id }, { jobId: poll.id, delay: input.durationSec * 1000, removeOnComplete: true, removeOnFail: 100 });
    this.io.to(rooms.session(sessionId)).emit("poll:started", poll);
    await this.broadcastProgress(sessionId, poll.id);
    logger.info({ sessionId, pollId: poll.id, teacherId }, "poll started");
    return poll;
  }

  async answer(sessionId: string, participantId: string, pollId: string, optionIndex: number) {
    const outcome = await polls.recordAnswer(pollId, sessionId, participantId, optionIndex);
    if (outcome !== "ok") return outcome;
    const { everyoneAnswered } = await this.broadcastProgress(sessionId, pollId);
    // Everyone online has answered: no point making the class wait for the timer.
    if (everyoneAnswered) await this.end(pollId);
    return outcome;
  }

  /**
   * answered = students who answered; total = students online plus anyone who answered and then left.
   * The poll may end early only when every *online* student has answered: comparing raw counts would
   * end it too soon when a student who already answered refreshes their tab.
   */
  async broadcastProgress(sessionId: string, pollId: string) {
    const [respondents, online] = await Promise.all([polls.respondentIds(pollId), onlineStudentIds(this.io, sessionId)]);
    const total = new Set([...online, ...respondents]).size;
    const progress = { pollId, answered: respondents.size, total };
    this.io.to(rooms.teachers(sessionId)).emit("poll:progress", progress);
    const everyoneAnswered = online.size > 0 && [...online].every((id) => respondents.has(id));
    return { ...progress, everyoneAnswered };
  }

  /** Safe to call many times; only the first call emits results. */
  async end(pollId: string): Promise<void> {
    const ended = await polls.endPoll(pollId);
    if (!ended) return;
    await this.timers.remove(pollId).catch(() => {});
    const { result, sessionId } = ended;
    this.io.to(rooms.session(sessionId)).emit("poll:ended", result);
    logger.info({ sessionId, pollId, responses: result.totalResponses }, "poll ended");

    if (config.aiEnabled && result.totalResponses > 0) {
      const session = await getSession(sessionId);
      if (session) {
        await enqueueAiJob({ kind: "poll-insight", teacherId: session.teacherId, sessionId, pollId }).catch((err) =>
          logger.warn({ err: (err as Error).message, pollId }, "insight not queued"),
        );
      }
    }
  }

  /** Ends polls whose deadline passed while nothing was running. */
  async recoverOverdue(): Promise<void> {
    for (const { id } of await polls.findOverduePolls()) await this.end(id);
  }

  async close(): Promise<void> {
    await this.worker.close();
    await this.timers.close();
  }
}

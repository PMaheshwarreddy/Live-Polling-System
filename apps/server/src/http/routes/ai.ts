import { Router } from "express";
import { AssistantAskSchema, GenerateQuizSchema, TutorAskSchema } from "@classpulse/shared";
import { requireStudent, requireTeacher, teacherId } from "../../auth.js";
import { aiStatus } from "../../services/aiStatus.js";
import { query, queryOne } from "../../db.js";
import { getSession, getSessionDocumentIds } from "../../repo/sessions.js";
import { getActivePoll } from "../../repo/polls.js";
import { enqueueAiJob, getAiJob, usageSummary } from "../../services/aiJobs.js";
import { HttpError } from "../errors.js";
import { verifyToken } from "../../auth.js";

export const aiRouter = Router();

aiRouter.get("/status", async (_req, res) => {
  res.json(await aiStatus());
});

aiRouter.post("/quiz", requireTeacher, async (req, res) => {
  const input = GenerateQuizSchema.parse(req.body);
  const doc = await queryOne<{ status: string }>("SELECT status FROM documents WHERE id = $1 AND teacher_id = $2", [input.documentId, teacherId(req)]);
  if (!doc) throw new HttpError(404, "Document not found");
  if (doc.status !== "ready") throw new HttpError(409, "That document is still processing");
  const jobId = await enqueueAiJob({ kind: "generate-quiz", teacherId: teacherId(req), ...input });
  res.status(202).json({ jobId });
});

aiRouter.post("/sessions/:id/assistant", requireTeacher, async (req, res) => {
  const { question } = AssistantAskSchema.parse(req.body);
  const s = await getSession(req.params.id as string);
  if (!s || s.teacherId !== teacherId(req)) throw new HttpError(404, "Session not found");
  const jobId = await enqueueAiJob({ kind: "assistant", teacherId: s.teacherId, sessionId: s.id, question });
  res.status(202).json({ jobId });
});

aiRouter.get("/sessions/:id/insights", requireTeacher, async (req, res) => {
  const s = await getSession(req.params.id as string);
  if (!s || s.teacherId !== teacherId(req)) throw new HttpError(404, "Session not found");
  const rows = await query<{ insight: unknown }>(
    "SELECT i.insight FROM poll_insights i JOIN polls p ON p.id = i.poll_id WHERE p.session_id = $1 ORDER BY p.seq",
    [s.id],
  );
  res.json({ insights: rows.map((r) => r.insight) });
});

/** Students ask the course tutor. Answers only come from documents the teacher attached. */
aiRouter.post("/tutor", requireStudent, async (req, res) => {
  const { question } = TutorAskSchema.parse(req.body);
  const claims = req.auth!;
  if (claims.role !== "student") throw new HttpError(403, "Students only");
  const s = await getSession(claims.sessionId);
  if (!s || s.status !== "open") throw new HttpError(410, "Session has ended");
  // Academic integrity: no asking the tutor for the answer to the question that's live right now.
  if (await getActivePoll(s.id)) throw new HttpError(423, "The tutor is paused while a question is live");
  if (!(await getSessionDocumentIds(s.id)).length) {
    throw new HttpError(409, "Your teacher hasn't attached course material to this session yet");
  }
  const jobId = await enqueueAiJob(
    { kind: "tutor", teacherId: s.teacherId, sessionId: s.id, participantId: claims.participantId, question },
    { participantId: claims.participantId },
  );
  res.status(202).json({ jobId });
});

/** Teachers can read their own jobs; students can read jobs they started. */
aiRouter.get("/jobs/:id", async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Missing token");
  let claims;
  try {
    claims = verifyToken(header.slice(7));
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
  const job = await getAiJob(req.params.id as string);
  const allowed =
    job &&
    ((claims.role === "teacher" && job.teacher_id === claims.teacherId && !job.participant_id) ||
      (claims.role === "student" && job.participant_id === claims.participantId));
  if (!job || !allowed) throw new HttpError(404, "Job not found");
  res.json({ id: job.id, kind: job.kind, status: job.status, output: job.output, error: job.error });
});

aiRouter.get("/usage", requireTeacher, async (req, res) => {
  res.json(await usageSummary(teacherId(req)));
});

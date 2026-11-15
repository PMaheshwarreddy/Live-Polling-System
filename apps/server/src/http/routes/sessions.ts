import { Router } from "express";
import { z } from "zod";
import { CreateSessionSchema, JoinSchema, rooms } from "@classpulse/shared";
import { requireTeacher, signToken, teacherId } from "../../auth.js";
import { config } from "../../config.js";
import { query } from "../../db.js";
import { createParticipant } from "../../repo/participants.js";
import { listResults } from "../../repo/polls.js";
import * as sessions from "../../repo/sessions.js";
import type { IO } from "../../realtime/types.js";
import { HttpError } from "../errors.js";

async function ownedSession(req: Parameters<typeof teacherId>[0], id: string) {
  const s = await sessions.getSession(id);
  if (!s || s.teacherId !== teacherId(req)) throw new HttpError(404, "Session not found");
  return s;
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  // Quote everything and neutralise spreadsheet formula injection.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

export function sessionsRouter(io: IO) {
  const r = Router();

  // ---- Public: joining by code ----
  r.get("/code/:code", async (req, res) => {
    const s = await sessions.getSessionByCode(req.params.code);
    if (!s) throw new HttpError(404, "No session with that code");
    res.json({ session: { code: s.code, title: s.title, status: s.status } });
  });

  r.post("/code/:code/join", async (req, res) => {
    const { name } = JoinSchema.parse(req.body);
    const s = await sessions.getSessionByCode(req.params.code);
    if (!s) throw new HttpError(404, "No session with that code");
    if (s.status !== "open") throw new HttpError(410, "This session has ended");
    const p = await createParticipant(s.id, name);
    const token = signToken({ role: "student", participantId: p.id, sessionId: s.id, name: p.name });
    res.status(201).json({ token, participant: { id: p.id, name: p.name }, session: { id: s.id, code: s.code, title: s.title } });
  });

  // ---- Teacher ----
  r.get("/", requireTeacher, async (req, res) => {
    res.json({ sessions: await sessions.listSessions(teacherId(req)) });
  });

  r.post("/", requireTeacher, async (req, res) => {
    const { title } = CreateSessionSchema.parse(req.body);
    res.status(201).json({ session: await sessions.createSession(teacherId(req), title) });
  });

  r.get("/:id", requireTeacher, async (req, res) => {
    const s = await ownedSession(req, req.params.id as string);
    res.json({ session: s, documentIds: await sessions.getSessionDocumentIds(s.id) });
  });

  r.post("/:id/close", requireTeacher, async (req, res) => {
    const s = await ownedSession(req, req.params.id as string);
    await sessions.closeSession(s.id);
    io.to(rooms.session(s.id)).emit("session:closed");
    res.json({ ok: true });
  });

  r.put("/:id/documents", requireTeacher, async (req, res) => {
    const s = await ownedSession(req, req.params.id as string);
    const { documentIds } = z.object({ documentIds: z.array(z.string().uuid()).max(20) }).parse(req.body);
    await sessions.setSessionDocuments(s.id, documentIds);
    const attached = await sessions.getSessionDocumentIds(s.id);
    io.to(rooms.session(s.id)).emit("session:tutor", { available: config.aiEnabled && attached.length > 0 });
    res.json({ documentIds: attached });
  });

  /** Class analytics: accuracy per question and score per student. */
  r.get("/:id/report", requireTeacher, async (req, res) => {
    const s = await ownedSession(req, req.params.id as string);
    const polls = await listResults(s.id);
    const students = await query<{ id: string; name: string; answered: string; correct: string; kicked: boolean }>(
      `SELECT pa.id, pa.name, pa.kicked_at IS NOT NULL AS kicked,
              count(r.poll_id) AS answered,
              count(r.poll_id) FILTER (WHERE r.option_index = ANY(p.correct_options)) AS correct
       FROM participants pa
       LEFT JOIN responses r ON r.participant_id = pa.id
       LEFT JOIN polls p ON p.id = r.poll_id
       WHERE pa.session_id = $1
       GROUP BY pa.id ORDER BY correct DESC, pa.name`,
      [s.id],
    );
    res.json({
      session: s,
      polls: polls.map((p) => {
        const correct = p.results.filter((x) => p.correctOptions.includes(x.optionIndex)).reduce((n, x) => n + x.count, 0);
        return { ...p, accuracy: p.totalResponses ? Math.round((correct / p.totalResponses) * 100) : null };
      }),
      students: students.map((st) => ({
        id: st.id,
        name: st.name,
        kicked: st.kicked,
        answered: Number(st.answered),
        correct: Number(st.correct),
        score: polls.length ? Math.round((Number(st.correct) / polls.length) * 100) : 0,
      })),
    });
  });

  r.get("/:id/export.csv", requireTeacher, async (req, res) => {
    const s = await ownedSession(req, req.params.id as string);
    const rows = await query<{ seq: number; question: string; name: string; option_index: number; options: string[]; correct: boolean; answered_at: Date }>(
      `SELECT p.seq, p.question, pa.name, r.option_index, p.options,
              r.option_index = ANY(p.correct_options) AS correct, r.answered_at
       FROM responses r JOIN polls p ON p.id = r.poll_id JOIN participants pa ON pa.id = r.participant_id
       WHERE p.session_id = $1 ORDER BY p.seq, pa.name`,
      [s.id],
    );
    const lines = [
      ["question_no", "question", "student", "answer", "correct", "answered_at"].map(csvCell).join(","),
      ...rows.map((x) =>
        [x.seq, x.question, x.name, x.options[x.option_index], x.correct ? "yes" : "no", x.answered_at.toISOString()].map(csvCell).join(","),
      ),
    ];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="classpulse-${s.code}.csv"`);
    res.send(lines.join("\n"));
  });

  return r;
}

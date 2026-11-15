import { randomInt } from "node:crypto";
import type { SessionInfo } from "@classpulse/shared";
import { query, queryOne } from "../db.js";

interface SessionRow {
  id: string;
  code: string;
  teacher_id: string;
  title: string;
  status: "open" | "closed";
  created_at: Date;
}

export const toSessionInfo = (r: SessionRow): SessionInfo => ({
  id: r.id,
  code: r.code,
  title: r.title,
  status: r.status,
  createdAt: r.created_at.toISOString(),
});

// No 0/O/1/I/L so codes are easy to read aloud and type.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function generateCode(): string {
  const pick = () => Array.from({ length: 3 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${pick()}-${pick()}`;
}

export async function createSession(teacherId: string, title: string): Promise<SessionInfo> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await queryOne<SessionRow>(
      `INSERT INTO sessions (code, teacher_id, title) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO NOTHING RETURNING *`,
      [generateCode(), teacherId, title],
    );
    if (row) return toSessionInfo(row);
  }
  throw new Error("Could not allocate a unique session code");
}

export async function getSession(id: string): Promise<(SessionInfo & { teacherId: string }) | null> {
  const row = await queryOne<SessionRow>("SELECT * FROM sessions WHERE id = $1", [id]);
  return row ? { ...toSessionInfo(row), teacherId: row.teacher_id } : null;
}

export async function getSessionByCode(code: string): Promise<(SessionInfo & { teacherId: string }) | null> {
  const row = await queryOne<SessionRow>("SELECT * FROM sessions WHERE code = $1", [code.toUpperCase()]);
  return row ? { ...toSessionInfo(row), teacherId: row.teacher_id } : null;
}

export async function listSessions(teacherId: string) {
  const rows = await query<SessionRow & { poll_count: string; participant_count: string }>(
    `SELECT s.*,
       (SELECT count(*) FROM polls p WHERE p.session_id = s.id) AS poll_count,
       (SELECT count(*) FROM participants pa WHERE pa.session_id = s.id) AS participant_count
     FROM sessions s WHERE s.teacher_id = $1 ORDER BY s.created_at DESC LIMIT 100`,
    [teacherId],
  );
  return rows.map((r) => ({
    ...toSessionInfo(r),
    pollCount: Number(r.poll_count),
    participantCount: Number(r.participant_count),
  }));
}

export async function closeSession(id: string): Promise<void> {
  await query("UPDATE sessions SET status = 'closed' WHERE id = $1", [id]);
}

export async function setSessionDocuments(sessionId: string, documentIds: string[]): Promise<void> {
  await query("DELETE FROM session_documents WHERE session_id = $1", [sessionId]);
  if (documentIds.length) {
    await query(
      `INSERT INTO session_documents (session_id, document_id)
       SELECT $1, d.id FROM documents d
       JOIN sessions s ON s.id = $1 AND s.teacher_id = d.teacher_id
       WHERE d.id = ANY($2::uuid[])`,
      [sessionId, documentIds],
    );
  }
}

export async function getSessionDocumentIds(sessionId: string): Promise<string[]> {
  const rows = await query<{ document_id: string }>(
    "SELECT document_id FROM session_documents WHERE session_id = $1",
    [sessionId],
  );
  return rows.map((r) => r.document_id);
}

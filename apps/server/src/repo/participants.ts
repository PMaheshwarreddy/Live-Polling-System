import { query, queryOne } from "../db.js";

export interface ParticipantRow {
  id: string;
  session_id: string;
  name: string;
  kicked_at: Date | null;
}

export async function createParticipant(sessionId: string, name: string): Promise<ParticipantRow> {
  const row = await queryOne<ParticipantRow>(
    "INSERT INTO participants (session_id, name) VALUES ($1, $2) RETURNING *",
    [sessionId, name],
  );
  return row!;
}

export const getParticipant = (id: string) =>
  queryOne<ParticipantRow>("SELECT * FROM participants WHERE id = $1", [id]);

export const listActiveParticipants = (sessionId: string) =>
  query<ParticipantRow>(
    "SELECT * FROM participants WHERE session_id = $1 AND kicked_at IS NULL ORDER BY joined_at",
    [sessionId],
  );

/** Returns true if the participant belonged to this session and was not already kicked. */
export async function kickParticipant(sessionId: string, participantId: string): Promise<boolean> {
  const rows = await query(
    "UPDATE participants SET kicked_at = now() WHERE id = $1 AND session_id = $2 AND kicked_at IS NULL RETURNING id",
    [participantId, sessionId],
  );
  return rows.length > 0;
}

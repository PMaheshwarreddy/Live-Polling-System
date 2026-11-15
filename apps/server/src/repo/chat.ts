import type { ChatMessage, Role } from "@classpulse/shared";
import { query, queryOne } from "../db.js";

interface ChatRow {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: Role;
  text: string;
  created_at: Date;
}

const toMessage = (r: ChatRow): ChatMessage => ({
  id: r.id,
  senderId: r.sender_id,
  senderName: r.sender_name,
  senderRole: r.sender_role,
  text: r.text,
  createdAt: r.created_at.toISOString(),
});

export async function addMessage(
  sessionId: string,
  sender: { id: string; name: string; role: Role },
  text: string,
): Promise<ChatMessage> {
  const row = await queryOne<ChatRow>(
    `INSERT INTO chat_messages (session_id, sender_id, sender_name, sender_role, text)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [sessionId, sender.id, sender.name, sender.role, text],
  );
  return toMessage(row!);
}

export async function recentMessages(sessionId: string, limit = 50): Promise<ChatMessage[]> {
  const rows = await query<ChatRow>(
    "SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY created_at DESC LIMIT $2",
    [sessionId, limit],
  );
  return rows.reverse().map(toMessage);
}

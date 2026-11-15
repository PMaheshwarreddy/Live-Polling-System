import { rooms, type Participant } from "@classpulse/shared";
import { listActiveParticipants } from "../repo/participants.js";
import type { IO } from "./types.js";

/**
 * Participant ids with at least one connected socket. fetchSockets() goes through the Redis
 * adapter, so this counts sockets on every server replica, not just this one.
 */
export async function onlineStudentIds(io: IO, sessionId: string): Promise<Set<string>> {
  const sockets = await io.in(rooms.session(sessionId)).fetchSockets();
  const ids = new Set<string>();
  for (const s of sockets) if (s.data.claims?.role === "student") ids.add(s.data.claims.participantId);
  return ids;
}

export async function participantList(io: IO, sessionId: string): Promise<Participant[]> {
  const [rows, online] = await Promise.all([listActiveParticipants(sessionId), onlineStudentIds(io, sessionId)]);
  return rows.map((r) => ({ id: r.id, name: r.name, online: online.has(r.id) }));
}

export async function broadcastParticipants(io: IO, sessionId: string): Promise<void> {
  io.to(rooms.session(sessionId)).emit("participants:update", await participantList(io, sessionId));
}

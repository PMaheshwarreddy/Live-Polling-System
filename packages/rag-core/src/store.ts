import type { Pool, PoolClient } from "pg";
import { terms } from "./text.js";

export type Db = Pick<Pool, "query">;

export interface Hit {
  childId: string;
  parentId: string;
  documentId: string;
  documentTitle: string;
  heading: string;
  parentContent: string;
  childContent: string;
  score: number;
}

const vec = (v: number[]) => `[${v.join(",")}]`;

const HIT_SELECT = `
  c.id AS child_id, p.id AS parent_id, c.document_id, d.title AS document_title,
  coalesce(p.context, '') AS heading, p.content AS parent_content, c.content AS child_content`;

interface HitRow {
  child_id: string;
  parent_id: string;
  document_id: string;
  document_title: string;
  heading: string;
  parent_content: string;
  child_content: string;
  score: number;
}
const toHit = (r: HitRow): Hit => ({
  childId: r.child_id,
  parentId: r.parent_id,
  documentId: r.document_id,
  documentTitle: r.document_title,
  heading: r.heading,
  parentContent: r.parent_content,
  childContent: r.child_content,
  score: Number(r.score),
});

export async function vectorSearch(db: Db, docIds: string[], embedding: number[], k: number): Promise<Hit[]> {
  const { rows } = await db.query<HitRow>(
    `SELECT ${HIT_SELECT}, 1 - (c.embedding <=> $2::vector) AS score
     FROM chunks c JOIN chunks p ON p.id = c.parent_id JOIN documents d ON d.id = c.document_id
     WHERE c.kind = 'child' AND c.document_id = ANY($1::uuid[])
     ORDER BY c.embedding <=> $2::vector LIMIT $3`,
    [docIds, vec(embedding), k],
  );
  return rows.map(toHit);
}

/** BM25-style keyword search. Terms are OR-ed: natural questions rarely contain every word of the answer. */
export async function keywordSearch(db: Db, docIds: string[], text: string, k: number): Promise<Hit[]> {
  const words = [...new Set(terms(text))].slice(0, 16);
  if (!words.length) return [];
  const { rows } = await db.query<HitRow>(
    `WITH q AS (SELECT to_tsquery('english', $2) AS q)
     SELECT ${HIT_SELECT}, ts_rank_cd(c.tsv, q.q) AS score
     FROM q, chunks c JOIN chunks p ON p.id = c.parent_id JOIN documents d ON d.id = c.document_id
     WHERE c.kind = 'child' AND c.document_id = ANY($1::uuid[]) AND c.tsv @@ q.q
     ORDER BY score DESC LIMIT $3`,
    [docIds, words.join(" | "), k],
  );
  return rows.map(toHit);
}

export async function conceptSearch(db: Db, docIds: string[], embedding: number[], query: string, k: number) {
  const { rows } = await db.query<{ id: string; name: string; score: number }>(
    `SELECT id, name, 1 - (embedding <=> $2::vector) AS score FROM concepts
     WHERE document_id = ANY($1::uuid[])
     ORDER BY (CASE WHEN position(name in $4) > 0 THEN 1 ELSE 0 END) DESC, embedding <=> $2::vector
     LIMIT $3`,
    [docIds, vec(embedding), k, query.toLowerCase()],
  );
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

export async function conceptNeighbors(db: Db, conceptIds: string[]): Promise<{ id: string; name: string }[]> {
  if (!conceptIds.length) return [];
  const { rows } = await db.query<{ id: string; name: string }>(
    `SELECT DISTINCT k.id, k.name FROM concept_edges e
     JOIN concepts k ON k.id = CASE WHEN e.source_id = ANY($1::uuid[]) THEN e.target_id ELSE e.source_id END
     WHERE e.source_id = ANY($1::uuid[]) OR e.target_id = ANY($1::uuid[])`,
    [conceptIds],
  );
  return rows;
}

/** Child chunks linked to the given concepts, ranked by how many of them each chunk covers. */
export async function chunksForConcepts(db: Db, seedIds: string[], neighborIds: string[], k: number): Promise<Hit[]> {
  const all = [...new Set([...seedIds, ...neighborIds])];
  if (!all.length) return [];
  const { rows } = await db.query<HitRow>(
    `SELECT ${HIT_SELECT},
            sum(CASE WHEN cc.concept_id = ANY($2::uuid[]) THEN 2 ELSE 1 END) AS score
     FROM chunk_concepts cc
     JOIN chunks c ON c.id = cc.chunk_id JOIN chunks p ON p.id = c.parent_id JOIN documents d ON d.id = c.document_id
     WHERE cc.concept_id = ANY($1::uuid[])
     GROUP BY c.id, p.id, d.title
     ORDER BY score DESC LIMIT $3`,
    [all, seedIds, k],
  );
  return rows.map(toHit);
}

export interface StoredChunks {
  parents: { heading: string; content: string; children: { content: string; embedding: number[] }[] }[];
  concepts: { name: string; description: string; embedding: number[]; parents: number[] }[];
  edges: { source: string; target: string; relation: string }[];
}

/** Writes all chunks, concepts and edges for a document in one transaction. */
export async function saveDocument(client: PoolClient, documentId: string, data: StoredChunks): Promise<void> {
  await client.query("DELETE FROM chunks WHERE document_id = $1", [documentId]);
  await client.query("DELETE FROM concepts WHERE document_id = $1", [documentId]);
  const childIdsByParent: string[][] = [];
  let ord = 0;
  for (const p of data.parents) {
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO chunks (document_id, kind, ord, content, context) VALUES ($1, 'parent', $2, $3, $4) RETURNING id",
      [documentId, ord++, p.content, p.heading],
    );
    const parentId = rows[0]!.id;
    const ids: string[] = [];
    for (const c of p.children) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO chunks (document_id, parent_id, kind, ord, content, context, embedding)
         VALUES ($1, $2, 'child', $3, $4, $5, $6::vector) RETURNING id`,
        [documentId, parentId, ord++, c.content, p.heading, vec(c.embedding)],
      );
      ids.push(r.rows[0]!.id);
    }
    childIdsByParent.push(ids);
  }
  const conceptIds = new Map<string, string>();
  for (const c of data.concepts) {
    const { rows } = await client.query<{ id: string }>(
      "INSERT INTO concepts (document_id, name, description, embedding) VALUES ($1, $2, $3, $4::vector) RETURNING id",
      [documentId, c.name, c.description, vec(c.embedding)],
    );
    const conceptId = rows[0]!.id;
    conceptIds.set(c.name, conceptId);
    // Link the concept to the children of every parent that mentions it, where the child mentions it.
    for (const pi of c.parents) {
      const children = data.parents[pi]!.children;
      const ids = childIdsByParent[pi]!;
      const matching = ids.filter((_, i) => children[i]!.content.toLowerCase().includes(c.name));
      for (const childId of matching.length ? matching : ids) {
        await client.query("INSERT INTO chunk_concepts (chunk_id, concept_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
          childId,
          conceptId,
        ]);
      }
    }
  }
  for (const e of data.edges) {
    const s = conceptIds.get(e.source);
    const t = conceptIds.get(e.target);
    if (s && t)
      await client.query(
        "INSERT INTO concept_edges (document_id, source_id, target_id, relation) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [documentId, s, t, e.relation],
      );
  }
}

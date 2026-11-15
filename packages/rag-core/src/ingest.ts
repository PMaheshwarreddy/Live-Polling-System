import type { Pool } from "pg";
import { chunkDocument, contextLine } from "./chunk.js";
import { extractConcepts } from "./concepts.js";
import type { Models, Ollama } from "./llm.js";
import { saveDocument } from "./store.js";

export interface IngestResult {
  parents: number;
  children: number;
  concepts: number;
  edges: number;
}

/**
 * Text → parent/child chunks → embeddings (with a context prefix per chunk) → concept graph → Postgres.
 * Only embedding calls hit the model, so a 20-page handout ingests in seconds on a laptop CPU.
 */
export async function ingestText(
  deps: { pool: Pool; llm: Ollama; models: Models },
  documentId: string,
  title: string,
  text: string,
  onProgress: (pct: number, message: string) => void = () => {},
): Promise<IngestResult> {
  const clean = text.split("\u0000").join("").trim();
  if (clean.length < 50) throw new Error("This file has almost no readable text (scanned PDFs need OCR first).");

  onProgress(10, "Splitting into chunks");
  const parents = chunkDocument(clean, title);
  const children = parents.flatMap((p) => p.children.map((c) => `${contextLine(title, p.heading)}\n${c.content}`));

  onProgress(25, `Embedding ${children.length} chunks`);
  const childEmb = await deps.llm.embed(deps.models.embed, children, "ingest-embed");

  onProgress(70, "Building concept graph");
  const { concepts, edges } = extractConcepts(parents);
  const conceptEmb = await deps.llm.embed(deps.models.embed, concepts.map((c) => `${c.name}: ${c.description}`), "ingest-embed");

  onProgress(85, "Saving");
  let i = 0;
  const client = await deps.pool.connect();
  try {
    await client.query("BEGIN");
    await saveDocument(client, documentId, {
      parents: parents.map((p) => ({ ...p, children: p.children.map((c) => ({ content: c.content, embedding: childEmb[i++]! })) })),
      concepts: concepts.map((c, j) => ({ ...c, embedding: conceptEmb[j]! })),
      edges,
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { parents: parents.length, children: children.length, concepts: concepts.length, edges: edges.length };
}

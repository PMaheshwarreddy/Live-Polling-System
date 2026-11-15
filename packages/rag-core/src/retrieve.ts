import type { RagStrategy } from "@classpulse/shared";
import { dedupeByParent, rrf } from "./fusion.js";
import type { Models, Ollama } from "./llm.js";
import * as store from "./store.js";
import type { Db, Hit } from "./store.js";

export interface RetrieveResult {
  hits: Hit[];
  strategy: RagStrategy;
  /** Human-readable steps, shown in the UI's "how this answer was found" panel and in eval logs. */
  trace: string[];
  latencyMs: number;
}

export interface RetrieverDeps {
  db: Db;
  llm: Ollama;
  models: Models;
}

const POOL = 20;

export class Retriever {
  constructor(private readonly d: RetrieverDeps) {}

  private async embed(text: string): Promise<number[]> {
    const [v] = await this.d.llm.embed(this.d.models.embed, [text], "retrieval-embed");
    return v!;
  }

  async retrieve(query: string, docIds: string[], strategy: RagStrategy = "hybrid", k = 3): Promise<RetrieveResult> {
    const started = Date.now();
    const trace: string[] = [];
    if (!docIds.length) return { hits: [], strategy, trace: ["no documents attached"], latencyMs: 0 };
    let hits: Hit[];
    switch (strategy) {
      case "vector":
        hits = await this.vector(query, docIds, trace);
        break;
      case "hybrid":
        hits = await this.hybrid(query, docIds, trace);
        break;
      case "hyde":
        hits = await this.hyde(query, docIds, trace);
        break;
      case "crag":
        hits = await this.crag(query, docIds, trace, k);
        break;
      case "graph":
        hits = await this.graph(query, docIds, trace);
        break;
    }
    return { hits: dedupeByParent(hits, k), strategy, trace, latencyMs: Date.now() - started };
  }

  /** Dense retrieval: cosine similarity between the question and each child chunk. */
  private async vector(query: string, docIds: string[], trace: string[]) {
    const hits = await store.vectorSearch(this.d.db, docIds, await this.embed(query), POOL);
    trace.push(`vector search: ${hits.length} candidates`);
    return hits;
  }

  /** Dense + BM25 keyword search, merged with Reciprocal Rank Fusion. */
  private async hybrid(query: string, docIds: string[], trace: string[], embedText = query) {
    const [dense, sparse] = await Promise.all([
      store.vectorSearch(this.d.db, docIds, await this.embed(embedText), POOL),
      store.keywordSearch(this.d.db, docIds, query, POOL),
    ]);
    trace.push(`hybrid: ${dense.length} vector + ${sparse.length} keyword hits, fused with RRF`);
    return rrf([dense, sparse]);
  }

  /** HyDE: embed a hypothetical answer instead of the question, since answers look like answers. */
  private async hyde(query: string, docIds: string[], trace: string[]) {
    const hypothetical = await this.d.llm.chat({
      model: this.d.models.fast,
      feature: "rag-hyde",
      system: "You write short textbook passages.",
      prompt: `Write a 2-3 sentence textbook passage that answers this question. Do not mention the question.\n\nQuestion: ${query}`,
      maxTokens: 90,
      temperature: 0.2,
    });
    trace.push(`HyDE passage: “${hypothetical.slice(0, 120)}${hypothetical.length > 120 ? "…" : ""}”`);
    return this.hybrid(query, docIds, trace, `${query}\n${hypothetical}`);
  }

  /**
   * Corrective RAG: a small model grades the retrieved passages. Irrelevant ones are dropped;
   * if none survive, the question is rewritten into search keywords and retrieval runs again.
   */
  private async crag(query: string, docIds: string[], trace: string[], k: number) {
    const first = dedupeByParent(await this.hybrid(query, docIds, trace), Math.max(k + 2, 5));
    const relevant = await this.grade(query, first);
    trace.push(`CRAG grader kept ${relevant.length}/${first.length} passages`);
    if (relevant.length >= Math.min(2, k)) return [...relevant, ...first.filter((h) => !relevant.includes(h))];

    const rewritten = await this.d.llm.chat({
      model: this.d.models.fast,
      feature: "rag-crag-rewrite",
      prompt: `Rewrite this student question as a short list of search keywords (max 10 words). Output only the keywords.\n\nQuestion: ${query}`,
      maxTokens: 30,
      temperature: 0,
    });
    trace.push(`CRAG rewrote query → “${rewritten}”`);
    const second = await this.hybrid(`${query} ${rewritten}`, docIds, trace, rewritten);
    return rrf([relevant, second, first]);
  }

  private async grade(query: string, hits: Hit[]): Promise<Hit[]> {
    if (!hits.length) return [];
    const passages = hits.map((h, i) => `[${i + 1}] ${h.childContent.slice(0, 400)}`).join("\n\n");
    try {
      const out = await this.d.llm.chatJson(
        {
          model: this.d.models.fast,
          feature: "rag-crag-grade",
          system: "You judge whether passages help answer a question. Be strict.",
          prompt: `Question: ${query}\n\nPassages:\n${passages}\n\nList the numbers of the passages that contain information useful for answering the question.`,
          schema: { type: "object", properties: { relevant: { type: "array", items: { type: "integer" } } }, required: ["relevant"] },
          maxTokens: 40,
          temperature: 0,
        },
        (v) => {
          const r = (v as { relevant?: unknown }).relevant;
          if (!Array.isArray(r)) throw new Error("missing relevant");
          return r.filter((n): n is number => Number.isInteger(n));
        },
      );
      return [...new Set(out)].map((n) => hits[n - 1]).filter((h): h is Hit => Boolean(h));
    } catch {
      return hits; // grader failed: fall back to plain hybrid rather than returning nothing
    }
  }

  /**
   * GraphRAG (local search): find the concepts closest to the question, expand one hop through
   * the concept graph, collect the chunks those concepts appear in, and fuse with hybrid search.
   */
  private async graph(query: string, docIds: string[], trace: string[]) {
    const emb = await this.embed(query);
    const seeds = await store.conceptSearch(this.d.db, docIds, emb, query, 4);
    const neighbors = await store.conceptNeighbors(this.d.db, seeds.map((s) => s.id));
    const viaGraph = await store.chunksForConcepts(this.d.db, seeds.map((s) => s.id), neighbors.map((n) => n.id), POOL);
    trace.push(
      `graph: seed concepts [${seeds.map((s) => s.name).join(", ")}] → ${neighbors.length} neighbours → ${viaGraph.length} chunks`,
    );
    const [dense, sparse] = await Promise.all([
      store.vectorSearch(this.d.db, docIds, emb, POOL),
      store.keywordSearch(this.d.db, docIds, query, POOL),
    ]);
    // The graph widens recall to related ideas; half weight keeps it from outranking direct matches.
    return rrf([dense, sparse, viaGraph], 60, [1, 1, 0.5]);
  }
}

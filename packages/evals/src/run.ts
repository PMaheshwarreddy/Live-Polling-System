/**
 * Retrieval benchmark: ingests the sample document, asks every question with every strategy and
 * reports hit@1, hit@3, MRR and latency. Everything runs on local models through Ollama.
 *
 *   npm run eval                       # all strategies
 *   npm run eval -- --strategies vector,hybrid
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { RAG_STRATEGIES, type RagStrategy } from "@classpulse/shared";
import { Ollama, Retriever, ingestText, type LlmCall } from "@classpulse/rag-core";

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const models = {
  smart: env.AI_MODEL_SMART ?? "qwen2.5:3b",
  fast: env.AI_MODEL_FAST ?? "qwen2.5:1.5b",
  embed: env.AI_MODEL_EMBED ?? "all-minilm",
};
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const strategies = (arg("strategies")?.split(",") ?? [...RAG_STRATEGIES]) as RagStrategy[];
const K = 3;

interface Qa {
  q: string;
  expect: string;
  type: string;
}
const dataset = JSON.parse(await readFile(path.join(here, "../data/energy-in-cells.qa.json"), "utf8")) as {
  document: string;
  title: string;
  questions: Qa[];
};
const text = await readFile(path.join(here, "../data", dataset.document), "utf8");

const pool = new pg.Pool({ connectionString: env.DATABASE_URL ?? "postgres://classpulse:classpulse@localhost:5432/classpulse" });
let llmCalls = 0;
const llm = new Ollama(env.OLLAMA_URL ?? "http://localhost:11434", (c: LlmCall) => {
  if (c.feature.startsWith("rag-")) llmCalls++;
}, { numThread: Number(env.OLLAMA_NUM_THREAD ?? 0) });

// A dedicated eval account and document, re-ingested every run so chunking changes are picked up.
const { rows: t } = await pool.query<{ id: string }>(
  `INSERT INTO teachers (email, name, password_hash) VALUES ('eval@classpulse.local', 'Eval', '!')
   ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
);
await pool.query("DELETE FROM documents WHERE teacher_id = $1", [t[0]!.id]);
const { rows: d } = await pool.query<{ id: string }>(
  "INSERT INTO documents (teacher_id, title, mime, status) VALUES ($1, $2, 'text/markdown', 'ready') RETURNING id",
  [t[0]!.id, dataset.title],
);
const docId = d[0]!.id;
const ing = await ingestText({ pool, llm, models }, docId, dataset.title, text);
console.log(`Ingested "${dataset.title}": ${ing.parents} parents, ${ing.children} children, ${ing.concepts} concepts, ${ing.edges} edges\n`);

const retriever = new Retriever({ db: pool, llm, models });
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

interface Row {
  strategy: RagStrategy;
  hit1: number;
  hit3: number;
  mrr: number;
  avgMs: number;
  llmCalls: number;
  byType: Record<string, number>;
  misses: string[];
}
const rows: Row[] = [];
for (const strategy of strategies) {
  llmCalls = 0;
  let hit1 = 0, hit3 = 0, mrr = 0, ms = 0;
  const byType: Record<string, [number, number]> = {};
  const misses: string[] = [];
  for (const qa of dataset.questions) {
    const res = await retriever.retrieve(qa.q, [docId], strategy, K);
    ms += res.latencyMs;
    const rank = res.hits.findIndex((h) => norm(h.parentContent).includes(norm(qa.expect)));
    const bucket = (byType[qa.type] ??= [0, 0]);
    bucket[1]++;
    if (rank === 0) hit1++;
    if (rank >= 0) {
      hit3++;
      mrr += 1 / (rank + 1);
      bucket[0]++;
    } else misses.push(qa.q);
    process.stdout.write(rank >= 0 ? "✓" : "·");
  }
  const n = dataset.questions.length;
  const row: Row = {
    strategy,
    hit1: hit1 / n,
    hit3: hit3 / n,
    mrr: mrr / n,
    avgMs: Math.round(ms / n),
    llmCalls,
    byType: Object.fromEntries(Object.entries(byType).map(([k, [a, b]]) => [k, a / b])),
    misses,
  };
  rows.push(row);
  console.log(`  ${strategy}`);
}

const pct = (x: number) => `${Math.round(x * 100)}%`;
const types = [...new Set(dataset.questions.map((q) => q.type))];
const table = [
  `| Strategy | Hit@1 | Hit@3 | MRR | ${types.map((t) => `${t} (hit@3)`).join(" | ")} | Avg latency | LLM calls |`,
  `|---|---|---|---|${types.map(() => "---").join("|")}|---|---|`,
  ...rows.map(
    (r) =>
      `| ${r.strategy} | ${pct(r.hit1)} | ${pct(r.hit3)} | ${r.mrr.toFixed(2)} | ${types.map((t) => pct(r.byType[t] ?? 0)).join(" | ")} | ${r.avgMs} ms | ${r.llmCalls} |`,
  ),
].join("\n");
console.log(`\n${dataset.questions.length} questions, top-${K} passages, embed=${models.embed}, fast=${models.fast}\n`);
console.log(table);
for (const r of rows) if (r.misses.length) console.log(`\n${r.strategy} missed:\n  - ${r.misses.join("\n  - ")}`);

const out = path.join(here, "../results", `${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`);
await writeFile(out, JSON.stringify({ models, k: K, questions: dataset.questions.length, rows }, null, 2));
await writeFile(path.join(here, "../results/latest.md"), `${table}\n`);
console.log(`\nSaved ${path.relative(process.cwd(), out)}`);
await pool.end();

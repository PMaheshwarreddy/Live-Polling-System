import { STOPWORDS, splitSentences } from "./text.js";

export interface Concept {
  name: string;
  description: string;
  /** Indexes of the parent chunks that mention this concept. */
  parents: number[];
}
export interface ConceptEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

const tokenize = (s: string) => s.toLowerCase().match(/[a-z][a-z0-9-]*/g) ?? [];

/** Verbs and vague words that make poor concept names ("takes place", "produces"). */
const NOT_CONCEPTS = new Set(
  `make makes made making need needs needed take takes took taking place places produce produces produced producing
release releases released releasing form forms formed forming give gives gave given contain contains contained happen
happens happened turn turns turned store stores stored help helps helped absorb absorbs absorbed pass passed passes
combine combines combined enter enters entered break breaks broken known depend depends depending carry carries carried
move moves moved build builds built become becomes became keep keeps kept stop stops stopped rely relies split splits
attach attaches attached converts convert converted thought less far even still only small large main little lot
important different same various several certain whole called reverse things thing way ways part parts kind kinds
overall overview process processes molecule molecules stage stages step steps whichever amount number per sharply directly completely mostly instead fact common`.split(/\s+/),
);

/** Candidate key phrases: runs of 1-3 non-stopwords. */
function candidates(text: string): string[] {
  const out: string[] = [];
  for (const sentence of splitSentences(text)) {
    let run: string[] = [];
    const emit = () => {
      for (let n = 1; n <= Math.min(3, run.length); n++)
        for (let i = 0; i + n <= run.length; i++) out.push(run.slice(i, i + n).join(" "));
      run = [];
    };
    for (const w of tokenize(sentence)) {
      if (STOPWORDS.has(w) || NOT_CONCEPTS.has(w) || w.length < 3) emit();
      else run.push(w);
    }
    emit();
  }
  return out;
}

/**
 * Builds a concept graph for GraphRAG without calling a model, so ingestion stays fast on a CPU.
 * Concepts are key phrases scored by frequency x spread across chunks (multi-word phrases and
 * heading words get a boost). Two concepts are linked when they appear in the same chunk; the
 * relation records which section they share.
 */
export function extractConcepts(
  parents: { heading: string; content: string }[],
  opts: { maxConcepts?: number; maxEdgesPerConcept?: number } = {},
): { concepts: Concept[]; edges: ConceptEdge[] } {
  const maxConcepts = opts.maxConcepts ?? 30;
  const maxEdges = opts.maxEdgesPerConcept ?? 5;
  const stats = new Map<string, { tf: number; parents: Set<number> }>();
  const headingWords = new Set(parents.flatMap((p) => tokenize(p.heading)));

  parents.forEach((p, i) => {
    for (const c of candidates(`${p.heading}. ${p.content}`)) {
      const s = stats.get(c) ?? { tf: 0, parents: new Set<number>() };
      s.tf++;
      s.parents.add(i);
      stats.set(c, s);
    }
  });

  const scored = [...stats.entries()]
    .filter(([, s]) => s.tf >= 2)
    .map(([name, s]) => {
      const words = name.split(" ");
      const lengthBoost = words.length === 1 ? 1 : words.length === 2 ? 1.8 : 1.4;
      const headingBoost = words.some((w) => headingWords.has(w)) ? 1.5 : 1;
      // Phrases in almost every chunk are too generic to be useful concepts.
      const spread = s.parents.size / parents.length;
      const genericPenalty = parents.length > 4 && spread > 0.7 ? 0.3 : 1;
      return { name, s, score: Math.log1p(s.tf) * Math.sqrt(s.parents.size) * lengthBoost * headingBoost * genericPenalty };
    })
    .sort((a, b) => b.score - a.score);

  // Prefer specific phrases: drop a phrase that is a fragment of a longer chosen phrase with similar reach
  // ("transport chain" inside "electron transport chain"), and drop single words that only appear as part
  // of chosen phrases ("cycle" once "calvin cycle" and "krebs cycle" are in).
  const within = (small: string, big: string) => ` ${big} `.includes(` ${small} `) && small !== big;
  const picked: typeof scored = [];
  for (const c of scored) {
    if (picked.length >= maxConcepts * 2) break;
    if (picked.some((k) => within(c.name, k.name) && k.s.parents.size >= c.s.parents.size * 0.6)) continue;
    for (let i = picked.length - 1; i >= 0; i--) {
      const k = picked[i]!;
      if (within(k.name, c.name) && c.s.parents.size >= k.s.parents.size * 0.6) picked.splice(i, 1);
    }
    picked.push(c);
  }
  const chosen = picked
    .filter((c) => c.name.includes(" ") || picked.filter((k) => within(c.name, k.name)).length < 2)
    .slice(0, maxConcepts);

  const concepts: Concept[] = chosen.map(({ name, s }) => {
    const idx = [...s.parents].sort((a, b) => a - b);
    const sentence =
      splitSentences(parents[idx[0]!]!.content).find((x) => x.toLowerCase().includes(name)) ?? parents[idx[0]!]!.content;
    return { name, description: sentence.slice(0, 280), parents: idx };
  });

  const edges: ConceptEdge[] = [];
  for (const a of concepts) {
    const links = concepts
      .filter((b) => b !== a)
      .map((b) => ({ b, shared: a.parents.filter((p) => b.parents.includes(p)) }))
      .filter((x) => x.shared.length > 0)
      .sort((x, y) => y.shared.length - x.shared.length)
      .slice(0, maxEdges);
    for (const { b, shared } of links) {
      if (a.name > b.name && edges.some((e) => e.source === b.name && e.target === a.name)) continue;
      const heading = parents[shared[0]!]!.heading;
      edges.push({ source: a.name, target: b.name, relation: `co-occurs in “${heading}”`, weight: shared.length });
    }
  }
  return { concepts, edges };
}

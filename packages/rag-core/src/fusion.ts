import type { Hit } from "./store.js";

/**
 * Reciprocal Rank Fusion: merges ranked lists without needing their scores to be comparable
 * (cosine similarity vs. BM25). score = sum over lists of 1 / (k + rank).
 */
export function rrf(lists: Hit[][], k = 60, weights: number[] = []): Hit[] {
  const fused = new Map<string, { hit: Hit; score: number }>();
  for (const [li, list] of lists.entries()) {
    const w = weights[li] ?? 1;
    list.forEach((hit, rank) => {
      const cur = fused.get(hit.childId);
      const add = w / (k + rank + 1);
      if (cur) cur.score += add;
      else fused.set(hit.childId, { hit, score: add });
    });
  }
  return [...fused.values()].sort((a, b) => b.score - a.score).map(({ hit, score }) => ({ ...hit, score }));
}

/** Small-to-big: keep the best child per parent, so the model never reads the same passage twice. */
export function dedupeByParent(hits: Hit[], k: number): Hit[] {
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const h of hits) {
    if (seen.has(h.parentId)) continue;
    seen.add(h.parentId);
    out.push(h);
    if (out.length >= k) break;
  }
  return out;
}

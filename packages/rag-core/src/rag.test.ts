import { describe, expect, it } from "vitest";
import { chunkDocument, contextLine, splitSections } from "./chunk.js";
import { extractConcepts } from "./concepts.js";
import { dedupeByParent, rrf } from "./fusion.js";
import type { Hit } from "./store.js";
import { terms } from "./text.js";
import { cleanOption } from "./quiz.js";

const doc = `# Photosynthesis
Photosynthesis is the process plants use to turn light energy into chemical energy. It happens in the chloroplast.
The chloroplast contains chlorophyll, a green pigment that absorbs light energy.

## Light reactions
The light reactions take place in the thylakoid membrane of the chloroplast. Water is split and oxygen is released.
The light reactions produce ATP and NADPH, which carry energy to the Calvin cycle.

## Calvin cycle
The Calvin cycle happens in the stroma of the chloroplast. It uses ATP and NADPH to fix carbon dioxide into glucose.
The enzyme RuBisCO captures carbon dioxide in the Calvin cycle.`;

describe("chunking", () => {
  it("splits on markdown headings", () => {
    const s = splitSections(doc, "Doc");
    expect(s.map((x) => x.heading)).toEqual(["Photosynthesis", "Light reactions", "Calvin cycle"]);
  });

  it("keeps sentences whole and nests children inside parents", () => {
    const parents = chunkDocument(doc, "Bio", { parentWords: 40, childWords: 15 });
    expect(parents.length).toBeGreaterThanOrEqual(3);
    for (const p of parents) {
      expect(p.children.length).toBeGreaterThan(0);
      expect(p.children.map((c) => c.content).join(" ")).toBe(p.content);
      expect(p.content.trim().endsWith(".")).toBe(true);
    }
  });

  it("builds a context line from title and heading", () => {
    expect(contextLine("Bio", "Calvin cycle")).toBe("Bio › Calvin cycle");
    expect(contextLine("Bio", "Bio")).toBe("Bio");
  });
});

describe("concept graph", () => {
  it("finds repeated key phrases and links co-occurring ones", () => {
    const parents = chunkDocument(doc, "Bio", { parentWords: 40, childWords: 15 });
    const { concepts, edges } = extractConcepts(parents);
    const names = concepts.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["calvin cycle", "chloroplast"]));
    expect(edges.length).toBeGreaterThan(0);
    for (const e of edges) {
      expect(names).toContain(e.source);
      expect(names).toContain(e.target);
    }
  });
});

const hit = (childId: string, parentId = childId): Hit => ({
  childId,
  parentId,
  documentId: "d",
  documentTitle: "D",
  heading: "",
  parentContent: "",
  childContent: "",
  score: 0,
});

describe("fusion", () => {
  it("ranks items found by several retrievers first", () => {
    const fused = rrf([
      [hit("a"), hit("b"), hit("c")],
      [hit("c"), hit("d"), hit("a")],
    ]);
    expect(fused.slice(0, 2).map((h) => h.childId).sort()).toEqual(["a", "c"]);
    expect(fused).toHaveLength(4);
  });

  it("keeps only the best child per parent", () => {
    const out = dedupeByParent([hit("a", "p1"), hit("b", "p1"), hit("c", "p2")], 5);
    expect(out.map((h) => h.childId)).toEqual(["a", "c"]);
  });
});

describe("terms", () => {
  it("drops stopwords and punctuation", () => {
    expect(terms("What is the role of RuBisCO in the Calvin cycle?")).toEqual(["role", "rubisco", "calvin", "cycle"]);
  });
});

describe("quiz option cleanup", () => {
  it("strips letter markers the model adds", () => {
    expect(["{a} 2 ATP", "(B) Water", "C. Oxygen", "d) Glucose", "[e] Stroma", "4 ATP", "ATP synthase"].map(cleanOption)).toEqual([
      "2 ATP",
      "Water",
      "Oxygen",
      "Glucose",
      "Stroma",
      "4 ATP",
      "ATP synthase",
    ]);
  });
});

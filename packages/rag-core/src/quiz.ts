import { z } from "zod";
import type { Citation, QuizQuestionDraft, RagStrategy } from "@classpulse/shared";
import type { Models, Ollama } from "./llm.js";
import type { Retriever } from "./retrieve.js";
import type { Db, Hit } from "./store.js";

const QuestionSchema = z.object({
  question: z.string().min(8).max(300),
  options: z.array(z.string().min(1).max(120)).min(3).max(5),
  correctIndex: z.number().int().min(0),
  explanation: z.string().min(1).max(600),
  difficulty: z.enum(["easy", "medium", "hard"]).catch("medium"),
  bloomLevel: z.enum(["remember", "understand", "apply", "analyze", "evaluate", "create"]).catch("understand"),
  concept: z.string().max(80).catch(""),
});

const JSON_SCHEMA = {
  type: "object",
  properties: {
    question: { type: "string" },
    options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
    correctIndex: { type: "integer" },
    explanation: { type: "string" },
    difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
    bloomLevel: { type: "string", enum: ["remember", "understand", "apply", "analyze", "evaluate", "create"] },
    concept: { type: "string" },
  },
  required: ["question", "options", "correctIndex", "explanation", "difficulty", "bloomLevel", "concept"],
};

const DIFFICULTY_HINT = {
  easy: "an easy recall question (Bloom: remember)",
  medium: "a medium question that checks understanding (Bloom: understand)",
  hard: "a hard question that asks the student to apply or analyse an idea (Bloom: apply/analyze)",
};

export interface QuizRequest {
  docIds: string[];
  topic?: string;
  count: number;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  strategy?: RagStrategy;
  onProgress?: (pct: number, message: string, question?: QuizQuestionDraft) => void;
}

/** Fisher-Yates, with the correct answer tracked. Small models love putting the answer first. */
function shuffleOptions(options: string[], correct: number, rand = Math.random) {
  const idx = options.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  return { options: idx.map((i) => options[i]!), correctIndex: idx.indexOf(correct) };
}

/** Small models sometimes prefix options with their own letters: "{a} 2 ATP", "(B) Water", "C. Oxygen". */
export const cleanOption = (o: string) =>
  o
    .trim()
    .replace(/^(?:[{([]\s*[a-fA-F1-6]\s*[})\]]|[a-fA-F1-6][).:])\s*/, "")
    .trim();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const citationsFrom = (hits: Hit[]): Citation[] =>
  hits.map((h) => ({
    chunkId: h.parentId,
    documentTitle: h.heading && h.heading !== h.documentTitle ? `${h.documentTitle} › ${h.heading}` : h.documentTitle,
    excerpt: h.parentContent.slice(0, 280),
  }));

/** The most connected concepts, used as question topics when the teacher doesn't give one. */
async function focusTopics(db: Db, docIds: string[], n: number): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>(
    `SELECT k.name FROM concepts k LEFT JOIN chunk_concepts cc ON cc.concept_id = k.id
     WHERE k.document_id = ANY($1::uuid[]) GROUP BY k.id ORDER BY count(cc.chunk_id) DESC, k.name LIMIT $2`,
    [docIds, n * 3],
  );
  // Spread picks over the ranking so questions cover different parts of the material.
  const names = rows.map((r) => r.name);
  const step = Math.max(1, Math.floor(names.length / n));
  return Array.from({ length: n }, (_, i) => names[(i * step) % Math.max(1, names.length)] ?? "the key ideas");
}

export async function generateQuiz(
  deps: { db: Db; llm: Ollama; models: Models; retriever: Retriever },
  req: QuizRequest,
): Promise<{ questions: QuizQuestionDraft[]; strategy: RagStrategy; model: string }> {
  const strategy = req.strategy ?? "hybrid";
  const levels: ("easy" | "medium" | "hard")[] =
    req.difficulty === "mixed" ? ["easy", "medium", "hard"] : [req.difficulty];
  const topics = req.topic ? Array.from({ length: req.count }, () => req.topic!) : await focusTopics(deps.db, req.docIds, req.count);
  const questions: QuizQuestionDraft[] = [];
  const usedParents = new Set<string>();

  for (let i = 0; i < req.count; i++) {
    const level = levels[i % levels.length]!;
    req.onProgress?.(Math.round((i / req.count) * 100), `Writing question ${i + 1} of ${req.count}`);
    const { hits } = await deps.retriever.retrieve(topics[i]!, req.docIds, strategy, 4);
    // Prefer passages not used yet, so a topic-focused quiz still covers different facts.
    const fresh = hits.filter((h) => !usedParents.has(h.parentId));
    const context = (fresh.length ? fresh : hits).slice(0, 2);
    if (!context.length) continue;
    context.forEach((h) => usedParents.add(h.parentId));

    const avoid = questions.length ? `\nDo not repeat these questions:\n${questions.map((q) => `- ${q.question}`).join("\n")}` : "";
    const prompt = `Course material:
"""
${context.map((h) => h.parentContent).join("\n\n")}
"""

Write ${DIFFICULTY_HINT[level]} about "${topics[i]}" for a live classroom poll, based ONLY on the material above.
Rules:
- exactly 4 short options; exactly one is correct (correctIndex is its 0-based position)
- wrong options must be plausible misconceptions, not jokes
- explanation: one or two sentences saying why the answer is right, using the material
- concept: the 1-4 word idea being tested${avoid}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const q = await deps.llm.chatJson(
          {
            model: deps.models.smart,
            feature: "quiz",
            system: "You are an experienced teacher who writes clear, fair multiple-choice questions. Reply with JSON only.",
            prompt,
            schema: JSON_SCHEMA,
            temperature: attempt === 0 ? 0.4 : 0.2,
            maxTokens: 320,
          },
          (v) => QuestionSchema.parse(v),
        );
        const options = q.options.map(cleanOption);
        if (options.some((o) => !o)) throw new Error("empty option");
        if (q.correctIndex >= options.length) throw new Error("correct index out of range");
        if (new Set(options.map(norm)).size !== options.length) throw new Error("duplicate options");
        if (questions.some((x) => norm(x.question) === norm(q.question))) throw new Error("duplicate question");
        // Reject giveaways where the correct option is spelled out in the question itself.
        const answer = norm(options[q.correctIndex]!);
        if (answer.length > 0 && ` ${norm(q.question)} `.includes(` ${answer} `)) throw new Error("answer appears in question");
        const shuffled = shuffleOptions(options, q.correctIndex);
        const draft: QuizQuestionDraft = {
          question: q.question.trim(),
          options: shuffled.options,
          correctOptions: [shuffled.correctIndex],
          explanation: q.explanation.trim(),
          difficulty: q.difficulty,
          bloomLevel: q.bloomLevel,
          concept: q.concept || topics[i]!,
          citations: citationsFrom(context),
        };
        questions.push(draft);
        req.onProgress?.(Math.round(((i + 1) / req.count) * 100), `Question ${i + 1} ready`, draft);
        break;
      } catch {
        // retry once with a lower temperature, then move on to the next topic
      }
    }
  }
  if (!questions.length) throw new Error("The model could not write questions from this material. Try a specific topic.");
  return { questions, strategy, model: deps.models.smart };
}

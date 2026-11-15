import type { RagStrategy, TutorAnswer } from "@classpulse/shared";
import type { Models, Ollama } from "./llm.js";
import { citationsFrom } from "./quiz.js";
import type { Retriever } from "./retrieve.js";

export const NOT_FOUND = "I couldn't find that in your course material. Try asking your teacher, or rephrase the question.";

/** Grounded Q&A for students: answers only from the teacher's documents, with numbered citations. */
export async function answerAsTutor(
  deps: { llm: Ollama; models: Models; retriever: Retriever },
  input: { question: string; docIds: string[]; strategy?: RagStrategy; onToken?: (t: string) => void },
): Promise<TutorAnswer & { trace: string[] }> {
  const strategy = input.strategy ?? "hybrid";
  const { hits, trace } = await deps.retriever.retrieve(input.question, input.docIds, strategy, 3);
  if (!hits.length) {
    input.onToken?.(NOT_FOUND);
    return { answer: NOT_FOUND, citations: [], strategy, trace };
  }
  const sources = hits.map((h, i) => `[${i + 1}] (${h.documentTitle} › ${h.heading})\n${h.parentContent}`).join("\n\n");
  const answer = await deps.llm.chat({
    model: deps.models.fast,
    feature: "tutor",
    system: `You are a friendly, encouraging tutor for a school class. Answer ONLY using the numbered sources.
Cite sources inline like [1]. Keep answers to 2-4 short sentences in simple language.
If the sources do not contain the answer, reply exactly: "${NOT_FOUND}"`,
    prompt: `Sources:\n${sources}\n\nStudent question: ${input.question}`,
    maxTokens: 220,
    temperature: 0.2,
    onToken: input.onToken,
  });
  // Only cite sources the answer actually referenced (fall back to all if it cited none).
  const used = [...answer.matchAll(/\[(\d)\]/g)].map((m) => Number(m[1]) - 1).filter((i) => i >= 0 && i < hits.length);
  const cited = used.length ? [...new Set(used)].sort().map((i) => hits[i]!) : hits;
  return { answer, citations: answer === NOT_FOUND ? [] : citationsFrom(cited), strategy, trace };
}

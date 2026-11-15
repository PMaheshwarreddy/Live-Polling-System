import { z } from "zod";
import type { AiInsight, PollResult } from "@classpulse/shared";
import type { Models, Ollama } from "./llm.js";

const OutSchema = z.object({
  misconception: z.string().min(1).max(400),
  followUpQuestion: z.string().min(5).max(300),
  followUpOptions: z.array(z.string().min(1).max(120)).length(4),
  followUpCorrectIndex: z.number().int().min(0).max(3),
});

/**
 * After a poll ends: the numbers are computed exactly in code; the model only explains the most
 * common wrong answer and drafts a follow-up question the teacher can launch in one click.
 */
export async function pollInsight(deps: { llm: Ollama; models: Models }, poll: PollResult): Promise<AiInsight> {
  const correctCount = poll.results.filter((r) => poll.correctOptions.includes(r.optionIndex)).reduce((n, r) => n + r.count, 0);
  const accuracy = poll.totalResponses ? Math.round((correctCount / poll.totalResponses) * 100) : 0;
  const wrong = poll.results
    .filter((r) => !poll.correctOptions.includes(r.optionIndex) && r.count > 0)
    .sort((a, b) => b.count - a.count)[0];
  const summary =
    `${accuracy}% answered correctly (${correctCount}/${poll.totalResponses}).` +
    (wrong ? ` Most common wrong answer: “${poll.options[wrong.optionIndex]}” (${wrong.percentage}%).` : " No wrong answers.");

  if (!wrong || accuracy >= 85) return { pollId: poll.id, summary, misconception: null, followUp: null };

  const correctText = poll.correctOptions.map((i) => poll.options[i]).join(" / ");
  try {
    const out = await deps.llm.chatJson(
      {
        model: deps.models.fast,
        feature: "poll-insight",
        system: "You are an expert teacher who diagnoses student misconceptions. Reply with JSON only.",
        prompt: `Question: ${poll.question}
Correct answer: ${correctText}
Many students chose: ${poll.options[wrong.optionIndex]}

1. misconception: in one sentence, the likely misunderstanding behind the wrong choice.
2. A follow-up multiple-choice question (4 options, one correct) that targets that misunderstanding.`,
        schema: {
          type: "object",
          properties: {
            misconception: { type: "string" },
            followUpQuestion: { type: "string" },
            followUpOptions: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
            followUpCorrectIndex: { type: "integer" },
          },
          required: ["misconception", "followUpQuestion", "followUpOptions", "followUpCorrectIndex"],
        },
        maxTokens: 260,
        temperature: 0.3,
      },
      (v) => OutSchema.parse(v),
    );
    return {
      pollId: poll.id,
      summary,
      misconception: out.misconception,
      followUp: { question: out.followUpQuestion, options: out.followUpOptions, correctOptions: [out.followUpCorrectIndex] },
    };
  } catch {
    return { pollId: poll.id, summary, misconception: null, followUp: null };
  }
}

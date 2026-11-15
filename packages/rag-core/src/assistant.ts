import type { Models, Ollama } from "./llm.js";

/**
 * Teaching assistant: answers the teacher's questions about *this* class. The worker gathers the
 * real numbers (per-question accuracy, struggling students) from Postgres; the model only reasons
 * over that summary, so it can't invent statistics.
 */
export async function askAssistant(
  deps: { llm: Ollama; models: Models },
  input: { question: string; classSummary: string; material?: string; onToken?: (t: string) => void },
): Promise<string> {
  return deps.llm.chat({
    model: deps.models.smart,
    feature: "assistant",
    system: `You are a teaching assistant helping a teacher during a live class.
Use only the class data provided; never invent numbers or names. Be concise and practical:
use short bullet points, and suggest one concrete next step when useful.`,
    prompt: `Class data:\n${input.classSummary}${input.material ? `\n\nRelevant course material:\n${input.material}` : ""}\n\nTeacher: ${input.question}`,
    maxTokens: 350,
    temperature: 0.3,
    onToken: input.onToken,
  });
}

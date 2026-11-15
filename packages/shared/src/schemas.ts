import { z } from "zod";

export const LIMITS = {
  questionMax: 300,
  optionMax: 120,
  minOptions: 2,
  maxOptions: 6,
  chatMax: 500,
  nameMax: 40,
  durations: [15, 30, 45, 60, 90, 120] as const,
};

export const PollInputSchema = z
  .object({
    question: z.string().trim().min(1).max(LIMITS.questionMax),
    options: z
      .array(z.string().trim().min(1).max(LIMITS.optionMax))
      .min(LIMITS.minOptions)
      .max(LIMITS.maxOptions),
    correctOptions: z.array(z.number().int().min(0)).min(1, "Mark at least one correct option"),
    durationSec: z.number().int().min(10).max(300),
    explanation: z.string().max(1000).optional(),
    documentId: z.string().uuid().optional(),
  })
  .refine((p) => p.correctOptions.every((i) => i < p.options.length), {
    message: "Correct option index out of range",
    path: ["correctOptions"],
  });
export type PollInput = z.infer<typeof PollInputSchema>;

export const AnswerSchema = z.object({
  pollId: z.string().uuid(),
  optionIndex: z.number().int().min(0).max(LIMITS.maxOptions - 1),
});

export const ChatSchema = z.object({ text: z.string().trim().min(1).max(LIMITS.chatMax) });
export const KickSchema = z.object({ participantId: z.string().uuid() });
export const PollIdSchema = z.object({ pollId: z.string().uuid() });

export const SignupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});
export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export const CreateSessionSchema = z.object({ title: z.string().trim().min(1).max(120) });
export const JoinSchema = z.object({ name: z.string().trim().min(1).max(LIMITS.nameMax) });

/** Retrieval strategies implemented in packages/rag-core and compared in packages/evals. */
export const RAG_STRATEGIES = ["vector", "hybrid", "hyde", "crag", "graph"] as const;
export type RagStrategy = (typeof RAG_STRATEGIES)[number];

export const GenerateQuizSchema = z.object({
  documentId: z.string().uuid(),
  topic: z.string().trim().max(200).optional(),
  count: z.number().int().min(1).max(8).default(3),
  difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
  strategy: z.enum(RAG_STRATEGIES).optional(),
});
export type GenerateQuizInput = z.infer<typeof GenerateQuizSchema>;

export const TutorAskSchema = z.object({ question: z.string().trim().min(1).max(1000) });
export const AssistantAskSchema = z.object({ question: z.string().trim().min(1).max(2000) });

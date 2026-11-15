import { z } from "zod";

const env = z
  .object({
    DATABASE_URL: z.string().default("postgres://classpulse:classpulse@localhost:5432/classpulse"),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    OLLAMA_URL: z.string().default("http://localhost:11434"),
    AI_MODEL_SMART: z.string().default("qwen2.5:3b"),
    AI_MODEL_FAST: z.string().default("qwen2.5:1.5b"),
    AI_MODEL_EMBED: z.string().default("all-minilm"),
    RAG_STRATEGY: z.enum(["vector", "hybrid", "hyde", "crag", "graph"]).default("hybrid"),
    /** Jobs run at once. Local models are CPU-bound, so 1-2 is right for a laptop. */
    /** CPU threads per model call. 0 lets Ollama decide (it often picks too few on laptops). */
    OLLAMA_NUM_THREAD: z.coerce.number().int().min(0).default(0),
    AI_WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(1),
  })
  .parse(process.env);

export const config = {
  ...env,
  models: { smart: env.AI_MODEL_SMART, fast: env.AI_MODEL_FAST, embed: env.AI_MODEL_EMBED },
};

import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string().default("postgres://classpulse:classpulse@localhost:5432/classpulse"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  JWT_SECRET: z.string().min(8).default("dev-only-secret-change-me"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  UPLOAD_DIR: z.string().default("./uploads"),
  AI_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  OLLAMA_URL: z.string().default("http://localhost:11434"),
  AI_MODEL_SMART: z.string().default("qwen2.5:3b"),
  AI_MODEL_FAST: z.string().default("qwen2.5:1.5b"),
  AI_MODEL_EMBED: z.string().default("all-minilm"),
  /** AI jobs (quiz, tutor, insight...) a teacher's account may start per day. Protects a shared CPU. */
  AI_DAILY_JOBS_PER_TEACHER: z.coerce.number().int().default(300),
});

const env = EnvSchema.parse(process.env);

if (env.NODE_ENV === "production" && env.JWT_SECRET === "dev-only-secret-change-me") {
  throw new Error("JWT_SECRET must be set in production");
}

export const config = {
  ...env,
  corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
  aiEnabled: env.AI_ENABLED,
};

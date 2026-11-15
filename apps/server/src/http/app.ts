import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { verifyToken } from "../auth.js";
import { pinoHttp } from "pino-http";
import { config } from "../config.js";
import { pool } from "../db.js";
import { logger } from "../logger.js";
import type { IO } from "../realtime/types.js";
import { errorHandler, HttpError } from "./errors.js";
import { aiRouter } from "./routes/ai.js";
import { authRouter } from "./routes/auth.js";
import { documentsRouter } from "./routes/documents.js";
import { sessionsRouter } from "./routes/sessions.js";
import { aiStatus } from "../services/aiStatus.js";

export function createApp(io: IO) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.startsWith("/health") ?? false } }));

  const opts = { windowMs: 60_000, standardHeaders: "draft-7" as const, legacyHeaders: false };
  // Login/signup: per IP, strict, against password guessing.
  const strict = rateLimit({ ...opts, limit: 20 });
  // Joining: a whole class often shares one school IP (NAT), so allow a classroom-sized burst.
  const join = rateLimit({ ...opts, limit: 300 });
  // Model-backed work: counted per logged-in user, not per IP, so classmates don't block each other.
  const ai = rateLimit({
    ...opts,
    limit: 20,
    skip: (req) => req.method === "GET",
    keyGenerator: (req) => {
      try {
        const c = verifyToken((req.headers.authorization ?? "").slice(7));
        return c.role === "teacher" ? `t:${c.teacherId}` : `s:${c.participantId}`;
      } catch {
        return `ip:${req.ip ?? "unknown"}`;
      }
    },
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.get("/health/ready", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ ok: true, ai: await aiStatus() });
  });

  app.use("/api/auth", strict, authRouter);
  app.use("/api/sessions/code", join);
  app.use("/api/sessions", sessionsRouter(io));
  app.use("/api/documents", ai, documentsRouter);
  app.use("/api/ai", ai, aiRouter);

  app.use((_req, _res, next) => next(new HttpError(404, "Not found")));
  app.use(errorHandler);
  return app;
}

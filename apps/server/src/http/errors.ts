import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../logger.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: err.issues[0]?.message ?? "Invalid input", issues: err.issues });
    return;
  }
  logger.error({ err }, "unhandled error");
  res.status(500).json({ error: "Internal server error" });
}

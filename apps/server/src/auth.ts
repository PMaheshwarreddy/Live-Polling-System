import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { AuthClaims } from "@classpulse/shared";
import { config } from "./config.js";
import { HttpError } from "./http/errors.js";

const TEACHER_TTL = "7d";
const STUDENT_TTL = "12h";

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, config.JWT_SECRET, {
    expiresIn: claims.role === "teacher" ? TEACHER_TTL : STUDENT_TTL,
  });
}

export function verifyToken(token: string): AuthClaims {
  const decoded = jwt.verify(token, config.JWT_SECRET);
  if (typeof decoded !== "object" || !decoded || !("role" in decoded)) throw new Error("bad token");
  return decoded as AuthClaims;
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 11);
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthClaims;
  }
}

function readBearer(req: Request): AuthClaims {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw new HttpError(401, "Missing token");
  try {
    return verifyToken(header.slice(7));
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
}

export function requireTeacher(req: Request, _res: Response, next: NextFunction) {
  const claims = readBearer(req);
  if (claims.role !== "teacher") throw new HttpError(403, "Teachers only");
  req.auth = claims;
  next();
}

export function requireStudent(req: Request, _res: Response, next: NextFunction) {
  const claims = readBearer(req);
  if (claims.role !== "student") throw new HttpError(403, "Students only");
  req.auth = claims;
  next();
}

export function teacherId(req: Request): string {
  if (req.auth?.role !== "teacher") throw new HttpError(403, "Teachers only");
  return req.auth.teacherId;
}

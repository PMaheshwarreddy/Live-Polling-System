import { Router } from "express";
import { LoginSchema, SignupSchema } from "@classpulse/shared";
import { checkPassword, hashPassword, requireTeacher, signToken, teacherId } from "../../auth.js";
import { queryOne } from "../../db.js";
import { HttpError } from "../errors.js";

export const authRouter = Router();

interface TeacherRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
}

const publicTeacher = (t: TeacherRow) => ({ id: t.id, email: t.email, name: t.name });

authRouter.post("/signup", async (req, res) => {
  const body = SignupSchema.parse(req.body);
  const row = await queryOne<TeacherRow>(
    `INSERT INTO teachers (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING RETURNING *`,
    [body.email, body.name, await hashPassword(body.password)],
  );
  if (!row) throw new HttpError(409, "An account with that email already exists");
  res.status(201).json({ token: signToken({ role: "teacher", teacherId: row.id, name: row.name }), teacher: publicTeacher(row) });
});

authRouter.post("/login", async (req, res) => {
  const body = LoginSchema.parse(req.body);
  const row = await queryOne<TeacherRow>("SELECT * FROM teachers WHERE email = $1", [body.email]);
  // Same message either way so the endpoint doesn't reveal which emails are registered.
  if (!row || !(await checkPassword(body.password, row.password_hash))) {
    throw new HttpError(401, "Wrong email or password");
  }
  res.json({ token: signToken({ role: "teacher", teacherId: row.id, name: row.name }), teacher: publicTeacher(row) });
});

authRouter.get("/me", requireTeacher, async (req, res) => {
  const row = await queryOne<TeacherRow>("SELECT * FROM teachers WHERE id = $1", [teacherId(req)]);
  if (!row) throw new HttpError(404, "Account not found");
  res.json({ teacher: publicTeacher(row) });
});

import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { requireTeacher, teacherId } from "../../auth.js";
import { config } from "../../config.js";
import { query, queryOne } from "../../db.js";
import { assertAiEnabled, enqueueAiJob } from "../../services/aiJobs.js";
import { HttpError } from "../errors.js";

const ALLOWED: Record<string, string> = {
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
};

mkdirSync(config.UPLOAD_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.UPLOAD_DIR,
    // Never trust the client's filename on disk.
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${ALLOWED[file.mimetype] ?? ".bin"}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const byExt = file.originalname.toLowerCase().endsWith(".md") ? "text/markdown" : file.mimetype;
    if (!ALLOWED[byExt]) return cb(new HttpError(415, "Upload a PDF, .txt or .md file"));
    file.mimetype = byExt;
    cb(null, true);
  },
});

interface DocRow {
  id: string;
  title: string;
  status: "processing" | "ready" | "failed";
  error: string | null;
  created_at: Date;
  chunk_count: string;
  concept_count: string;
}

export const documentsRouter = Router();
documentsRouter.use(requireTeacher);

documentsRouter.get("/", async (req, res) => {
  const rows = await query<DocRow>(
    `SELECT d.*,
       (SELECT count(*) FROM chunks c WHERE c.document_id = d.id AND c.kind = 'child') AS chunk_count,
       (SELECT count(*) FROM concepts k WHERE k.document_id = d.id) AS concept_count
     FROM documents d WHERE d.teacher_id = $1 ORDER BY d.created_at DESC`,
    [teacherId(req)],
  );
  res.json({
    documents: rows.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      error: d.error,
      chunkCount: Number(d.chunk_count),
      conceptCount: Number(d.concept_count),
      createdAt: d.created_at.toISOString(),
    })),
  });
});

documentsRouter.post("/", upload.single("file"), async (req, res) => {
  assertAiEnabled();
  const file = req.file;
  if (!file) throw new HttpError(400, "No file uploaded");
  const title = (typeof req.body?.title === "string" && req.body.title.trim()) || file.originalname;
  const doc = await queryOne<{ id: string }>(
    "INSERT INTO documents (teacher_id, title, mime) VALUES ($1, $2, $3) RETURNING id",
    [teacherId(req), title.slice(0, 200), file.mimetype],
  );
  try {
    const jobId = await enqueueAiJob({
      kind: "ingest-document",
      teacherId: teacherId(req),
      documentId: doc!.id,
      filePath: path.resolve(file.path),
      mime: file.mimetype,
    });
    res.status(202).json({ documentId: doc!.id, jobId });
  } catch (err) {
    await query("DELETE FROM documents WHERE id = $1", [doc!.id]);
    await unlink(file.path).catch(() => {});
    throw err;
  }
});

/** The concept graph extracted for GraphRAG, for the concept-map view. */
documentsRouter.get("/:id/graph", async (req, res) => {
  const doc = await queryOne("SELECT id FROM documents WHERE id = $1 AND teacher_id = $2", [req.params.id, teacherId(req)]);
  if (!doc) throw new HttpError(404, "Document not found");
  const nodes = await query<{ id: string; name: string; description: string }>(
    "SELECT id, name, description FROM concepts WHERE document_id = $1 ORDER BY name",
    [req.params.id],
  );
  const edges = await query<{ source: string; target: string; relation: string }>(
    "SELECT source_id AS source, target_id AS target, relation FROM concept_edges WHERE document_id = $1",
    [req.params.id],
  );
  res.json({ nodes, edges });
});

documentsRouter.delete("/:id", async (req, res) => {
  const rows = await query("DELETE FROM documents WHERE id = $1 AND teacher_id = $2 RETURNING id", [req.params.id, teacherId(req)]);
  if (!rows.length) throw new HttpError(404, "Document not found");
  res.json({ ok: true });
});

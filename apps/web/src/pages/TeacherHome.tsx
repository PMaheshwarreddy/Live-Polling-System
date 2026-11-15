import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, FileText, LogOut, Network, Plus, Presentation, Trash2, Upload, Users } from "lucide-react";
import type { ConceptGraph, DocumentInfo, SessionInfo } from "@classpulse/shared";
import { AiStatusPill, ConceptMap, useAiStatus } from "../components/ai";
import { Avatar, Empty, Logo, Modal, Spinner, ThemeToggle, useToast } from "../components/ui";
import { api } from "../lib/api";
import { teacherAuth, useTeacher } from "../lib/auth";
import { timeAgo } from "../lib/format";

type SessionRow = SessionInfo & { pollCount: number; participantCount: number };
interface Usage {
  dailyJobLimit: number;
  jobsToday: number;
  byFeature: { feature: string; model: string; calls: number; failed: number; avgLatencyMs: number; inputTokens: number; outputTokens: number }[];
}

export function TeacherTopbar({ children }: { children?: React.ReactNode }) {
  const auth = useTeacher()!;
  const status = useAiStatus();
  const nav = useNavigate();
  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link to="/teacher">
          <Logo />
        </Link>
        {children}
        <div className="grow" />
        <AiStatusPill status={status} />
        <ThemeToggle />
        <div className="row" style={{ gap: 8 }}>
          <Avatar name={auth.teacher.name} small />
          <span className="small bold" style={{ display: "none" }}>{auth.teacher.name}</span>
        </div>
        <button
          className="btn btn-ghost btn-icon"
          aria-label="Log out"
          title="Log out"
          onClick={() => {
            teacherAuth.set(null);
            nav("/");
          }}
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}

function Library({ token }: { token: string }) {
  const toast = useToast();
  const [docs, setDocs] = useState<DocumentInfo[] | null>(null);
  const [over, setOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [graph, setGraph] = useState<{ doc: DocumentInfo; graph: ConceptGraph } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api<{ documents: DocumentInfo[] }>("/api/documents", { token }).then((r) => setDocs(r.documents)), [token]);
  useEffect(() => {
    void load();
  }, [load]);
  // Poll while something is being processed by the AI worker.
  useEffect(() => {
    if (!docs?.some((d) => d.status === "processing")) return;
    const t = setInterval(() => void load(), 1500);
    return () => clearInterval(t);
  }, [docs, load]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      // "energy-in-cells.md" → "Energy in cells"
      const pretty = file.name.replace(/\.(pdf|md|txt)$/i, "").replace(/[-_]+/g, " ").trim();
      form.append("title", pretty.charAt(0).toUpperCase() + pretty.slice(1));
      await api("/api/documents", { token, form });
      toast(`Processing “${file.name}”…`);
      await load();
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <FileText size={18} />
        <h3 className="grow">Course library</h3>
        <span className="badge">{docs?.length ?? 0}</span>
      </div>
      <div className="card-body col">
        <div
          className={`dropzone ${over ? "over" : ""}`}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void upload(f);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        >
          {uploading ? <Spinner /> : <Upload size={22} style={{ color: "var(--brand)" }} />}
          <div className="bold small" style={{ marginTop: 6 }}>Drop a PDF, .md or .txt</div>
          <div className="tiny muted">Indexed locally for quizzes and the tutor</div>
          <input
            ref={input}
            type="file"
            accept=".pdf,.md,.txt,application/pdf,text/plain,text/markdown"
            hidden
            data-testid="doc-upload"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </div>
        {docs === null ? (
          <div className="shimmer" style={{ height: 56 }} />
        ) : (
          <div className="list" style={{ margin: "0 -8px" }}>
            {docs.map((d) => (
              <div key={d.id} className="list-row" data-testid="doc-row">
                <div className="logo-mark" style={{ width: 34, height: 34, borderRadius: 10, background: d.status === "failed" ? "var(--red)" : undefined }}>
                  {d.status === "processing" ? <Spinner size={16} /> : <FileText size={16} />}
                </div>
                <div className="grow">
                  <div className="bold small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</div>
                  <div className="tiny muted" data-testid="doc-status">
                    {d.status === "processing" && "Indexing…"}
                    {d.status === "ready" && `${d.chunkCount} chunks · ${d.conceptCount} concepts`}
                    {d.status === "failed" && <span style={{ color: "var(--red)" }}>{d.error ?? "Failed"}</span>}
                  </div>
                </div>
                {d.status === "ready" && (
                  <button
                    className="btn btn-ghost btn-sm btn-icon"
                    title="Concept map"
                    aria-label={`Concept map for ${d.title}`}
                    onClick={async () => setGraph({ doc: d, graph: await api<ConceptGraph>(`/api/documents/${d.id}/graph`, { token }) })}
                  >
                    <Network size={16} />
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm btn-icon btn-danger actions"
                  aria-label={`Delete ${d.title}`}
                  onClick={async () => {
                    if (!confirm(`Delete “${d.title}”?`)) return;
                    await api(`/api/documents/${d.id}`, { token, method: "DELETE" });
                    void load();
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      {graph && (
        <Modal label={`Concept map · ${graph.doc.title}`} onClose={() => setGraph(null)} wide>
          <div style={{ padding: "8px 18px 18px" }}>
            <ConceptMap graph={graph.graph} />
          </div>
        </Modal>
      )}
    </div>
  );
}

const FEATURE_LABEL: Record<string, string> = {
  quiz: "Quiz generation",
  tutor: "Student tutor",
  "poll-insight": "Poll insights",
  assistant: "Teaching assistant",
  "ingest-embed": "Document indexing",
  "retrieval-embed": "Search embeddings",
  "rag-hyde": "HyDE",
  "rag-crag-grade": "CRAG grading",
  "rag-crag-rewrite": "CRAG rewrite",
};

function UsageCard({ token }: { token: string }) {
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => {
    api<Usage>("/api/ai/usage", { token }).then(setU).catch(() => {});
  }, [token]);
  if (!u) return null;
  const top = u.byFeature.filter((f) => !f.feature.includes("embed")).slice(0, 5);
  return (
    <div className="card">
      <div className="card-head">
        <BarChart3 size={18} />
        <h3 className="grow">Local AI usage</h3>
        <span className="badge badge-green">$0.00</span>
      </div>
      <div className="card-body col" style={{ gap: 14 }}>
        <div>
          <div className="row between small">
            <span className="muted">AI jobs today</span>
            <b>
              {u.jobsToday} / {u.dailyJobLimit}
            </b>
          </div>
          <div className="progress" style={{ marginTop: 6 }}>
            <span style={{ width: `${Math.min(100, (u.jobsToday / u.dailyJobLimit) * 100)}%` }} />
          </div>
        </div>
        {top.length === 0 ? (
          <div className="small muted">No AI calls in the last 30 days.</div>
        ) : (
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: "6px 0" }}>Feature</th>
                <th style={{ padding: "6px 0", textAlign: "right" }}>Calls</th>
                <th style={{ padding: "6px 0", textAlign: "right" }}>Avg time</th>
              </tr>
            </thead>
            <tbody>
              {top.map((f) => (
                <tr key={f.feature + f.model}>
                  <td style={{ padding: "8px 0" }}>
                    <div className="bold">{FEATURE_LABEL[f.feature] ?? f.feature}</div>
                    <div className="tiny muted mono">{f.model}</div>
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right" }}>{f.calls}</td>
                  <td style={{ padding: "8px 0", textAlign: "right" }}>{(f.avgLatencyMs / 1000).toFixed(1)}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function TeacherHome() {
  const auth = useTeacher()!;
  const nav = useNavigate();
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ sessions: SessionRow[] }>("/api/sessions", { token: auth.token })
      .then((r) => setSessions(r.sessions))
      .catch((e) => {
        if ((e as { status?: number }).status === 401) teacherAuth.set(null);
        toast((e as Error).message, "error");
      });
  }, [auth.token, toast]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { session } = await api<{ session: SessionInfo }>("/api/sessions", { token: auth.token, body: { title: title.trim() } });
      nav(`/teacher/session/${session.id}`);
    } catch (err) {
      toast((err as Error).message, "error");
      setBusy(false);
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const open = sessions?.filter((s) => s.status === "open") ?? [];
  const past = sessions?.filter((s) => s.status === "closed") ?? [];

  return (
    <>
      <TeacherTopbar />
      <main className="container" style={{ padding: "32px 20px 64px" }}>
        <div className="fade-up" style={{ marginBottom: 26 }}>
          <div className="muted small bold">{greeting},</div>
          <h1 style={{ fontSize: 32 }}>{auth.teacher.name} 👋</h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 24, alignItems: "start" }} className="home-grid">
          <div className="col" style={{ gap: 24 }}>
            <form className="card fade-up" style={{ padding: 22, background: "var(--grad)", border: 0, color: "white", position: "relative", overflow: "hidden" }} onSubmit={create}>
              <div style={{ position: "absolute", right: -40, top: -40, width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,.1)" }} />
              <h2 style={{ fontSize: 22, position: "relative" }}>Start a live session</h2>
              <p style={{ opacity: 0.85, marginTop: 4, marginBottom: 16, position: "relative" }}>You'll get a join code and QR code to share with your class.</p>
              <div className="row" style={{ position: "relative" }}>
                <input
                  className="input"
                  style={{ height: 50, background: "rgba(255,255,255,.95)", color: "#17142b", border: 0 }}
                  placeholder="e.g. Biology, Period 3"
                  value={title}
                  required
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                  data-testid="new-session-title"
                />
                <button className="btn btn-dark btn-lg" disabled={busy || !title.trim()} style={{ background: "#17142b", color: "white" }} data-testid="new-session-submit">
                  {busy ? <Spinner /> : <><Plus size={18} /> Create</>}
                </button>
              </div>
            </form>

            <section className="col" style={{ gap: 12 }}>
              <div className="section-title">Live now</div>
              {sessions === null ? (
                <div className="shimmer" style={{ height: 90 }} />
              ) : open.length === 0 ? (
                <div className="card">
                  <Empty icon={<Presentation size={22} />} title="No open sessions">Create one above to start polling.</Empty>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                  {open.map((s) => (
                    <Link key={s.id} to={`/teacher/session/${s.id}`} className="card card-pad fade-up" style={{ color: "inherit", transition: "transform .15s" }}>
                      <div className="row between">
                        <span className="badge badge-green">
                          <span className="dot dot-green" /> Open
                        </span>
                        <span className="code-pill small">{s.code}</span>
                      </div>
                      <h3 style={{ fontSize: 18, margin: "14px 0 6px" }}>{s.title}</h3>
                      <div className="row small muted" style={{ gap: 14 }}>
                        <span className="row" style={{ gap: 5 }}><Users size={14} /> {s.participantCount}</span>
                        <span className="row" style={{ gap: 5 }}><BarChart3 size={14} /> {s.pollCount} polls</span>
                        <span className="grow" />
                        <span>{timeAgo(s.createdAt)}</span>
                      </div>
                      <div className="row bold small" style={{ marginTop: 14, color: "var(--brand-ink)", gap: 6 }}>
                        Open console <ArrowRight size={15} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {past.length > 0 && (
              <section className="col" style={{ gap: 12 }}>
                <div className="section-title">Past sessions</div>
                <div className="card">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th>Code</th>
                        <th>Students</th>
                        <th>Polls</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {past.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <div className="bold">{s.title}</div>
                            <div className="tiny muted">{timeAgo(s.createdAt)}</div>
                          </td>
                          <td className="mono small">{s.code}</td>
                          <td>{s.participantCount}</td>
                          <td>{s.pollCount}</td>
                          <td style={{ textAlign: "right" }}>
                            <Link className="btn btn-sm" to={`/teacher/session/${s.id}/report`}>
                              <BarChart3 size={14} /> Report
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>

          <aside className="col" style={{ gap: 24 }}>
            <Library token={auth.token} />
            <UsageCard token={auth.token} />
          </aside>
        </div>
      </main>
      <style>{`@media (max-width: 960px){ .home-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}

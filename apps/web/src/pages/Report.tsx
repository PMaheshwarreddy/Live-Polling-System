import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download, Target, Trophy, UserCheck, Users } from "lucide-react";
import type { PollResult, SessionInfo } from "@classpulse/shared";
import { ResultBars } from "../components/live";
import { Avatar, Empty, Spinner, useToast } from "../components/ui";
import { api, downloadFile } from "../lib/api";
import { useTeacher } from "../lib/auth";
import { TeacherTopbar } from "./TeacherHome";

interface ReportData {
  session: SessionInfo;
  polls: (PollResult & { accuracy: number | null })[];
  students: { id: string; name: string; kicked: boolean; answered: number; correct: number; score: number }[];
}

/** One thin horizontal bar: single series, one hue, value in text ink, native tooltip. */
function Bar({ value, label }: { value: number; label: string }) {
  return (
    <div className="row" style={{ gap: 10 }} title={label}>
      <div className="grow" style={{ height: 10, borderRadius: 4, background: "var(--bg-sunken)", overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: "var(--brand)", borderRadius: 4, transition: "width .8s cubic-bezier(.2,.8,.2,1)" }} />
      </div>
      <span className="bold small" style={{ minWidth: 40, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}%</span>
    </div>
  );
}

export function Report() {
  const { id = "" } = useParams();
  const auth = useTeacher()!;
  const toast = useToast();
  const [data, setData] = useState<ReportData | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api<ReportData>(`/api/sessions/${id}/report`, { token: auth.token })
      .then(setData)
      .catch((e) => toast((e as Error).message, "error"));
  }, [id, auth.token, toast]);

  if (!data)
    return (
      <>
        <TeacherTopbar />
        <div style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
          <Spinner size={28} />
        </div>
      </>
    );

  const answered = data.polls.filter((p) => p.accuracy !== null);
  const avgAcc = answered.length ? Math.round(answered.reduce((s, p) => s + p.accuracy!, 0) / answered.length) : 0;
  const totalAnswers = data.polls.reduce((s, p) => s + p.totalResponses, 0);
  const participation = data.students.length && data.polls.length ? Math.round((totalAnswers / (data.students.length * data.polls.length)) * 100) : 0;
  const hardest = [...answered].sort((a, b) => a.accuracy! - b.accuracy!)[0];

  return (
    <>
      <TeacherTopbar />
      <main className="container" style={{ padding: "28px 20px 64px" }}>
        <div className="row wrap between" style={{ marginBottom: 24 }}>
          <div className="row">
            <Link to={data.session.status === "open" ? `/teacher/session/${id}` : "/teacher"} className="btn btn-ghost btn-icon" aria-label="Back">
              <ArrowLeft size={18} />
            </Link>
            <div>
              <div className="section-title">Session report · {data.session.code}</div>
              <h1 style={{ fontSize: 28 }}>{data.session.title}</h1>
            </div>
          </div>
          <button className="btn" onClick={() => downloadFile(`/api/sessions/${id}/export.csv`, auth.token, `classpulse-${data.session.code}.csv`).catch((e) => toast(e.message, "error"))}>
            <Download size={16} /> Export CSV
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { icon: Target, label: "Average accuracy", value: `${avgAcc}%` },
            { icon: Users, label: "Students", value: data.students.length },
            { icon: Trophy, label: "Questions asked", value: data.polls.length },
            { icon: UserCheck, label: "Participation", value: `${participation}%` },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="card kpi" data-testid="kpi">
              <div className="row between">
                <span className="label">{label}</span>
                <Icon size={18} color="var(--text-3)" />
              </div>
              <div className="value">{value}</div>
            </div>
          ))}
        </div>

        {data.polls.length === 0 ? (
          <div className="card">
            <Empty icon={<Target size={22} />} title="No questions asked yet">Results will appear here after your first poll.</Empty>
          </div>
        ) : (
          <div className="report-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
            <section className="card">
              <div className="card-head">
                <h3 className="grow">Accuracy by question</h3>
                {hardest && hardest.accuracy! < 60 && <span className="badge">Hardest: Q{hardest.seq}</span>}
              </div>
              <div className="col" style={{ padding: 12, gap: 4 }}>
                {data.polls.map((p) => (
                  <div key={p.id}>
                    <button className="list-row" style={{ width: "100%", border: 0, background: "none", cursor: "pointer", textAlign: "left", flexDirection: "column", alignItems: "stretch", gap: 8 }} onClick={() => setOpen(open === p.id ? null : p.id)}>
                      <div className="row small">
                        <span className="badge">Q{p.seq}</span>
                        <span className="grow bold">{p.question}</span>
                        <span className="muted tiny">{p.totalResponses} answers</span>
                      </div>
                      <Bar value={p.accuracy ?? 0} label={`Q${p.seq}: ${p.accuracy ?? 0}% correct of ${p.totalResponses} answers`} />
                    </button>
                    {open === p.id && (
                      <div style={{ padding: "4px 12px 16px" }}>
                        <ResultBars result={p} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="card">
              <div className="card-head">
                <h3 className="grow">Students</h3>
                <span className="tiny muted">score = correct / questions</span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th style={{ textAlign: "right" }}>Correct</th>
                    <th style={{ width: "42%" }}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((s) => (
                    <tr key={s.id} data-testid="report-student">
                      <td>
                        <div className="row" style={{ gap: 10 }}>
                          <Avatar name={s.name} small />
                          <span className="bold">{s.name}</span>
                          {s.kicked && <span className="badge">removed</span>}
                        </div>
                      </td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {s.correct}/{data.polls.length}
                      </td>
                      <td>
                        <Bar value={s.score} label={`${s.name}: ${s.correct} of ${data.polls.length} correct, answered ${s.answered}`} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        )}
      </main>
      <style>{`@media (max-width: 960px){ .report-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </>
  );
}

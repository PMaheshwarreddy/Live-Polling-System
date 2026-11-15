import { useEffect, useState } from "react";
import { Check, ChevronDown, Lightbulb, ListChecks, Pencil, Play, Plus, Rocket, Send, Sparkles, Square, Timer, Wand2, X } from "lucide-react";
import { LIMITS, RAG_STRATEGIES, type DocumentInfo, type PollInput, type PollProgress, type PollResult, type PublicPoll, type QuizDraft, type QuizQuestionDraft, type RagStrategy, type AiInsight } from "@classpulse/shared";
import { api } from "../lib/api";
import { useAiJob } from "../lib/aiJob";
import { OPTION_COLORS, accuracy, letter } from "../lib/format";
import type { LiveActions } from "../lib/live";
import { useCountdown } from "../lib/live";
import { AiLabel, Citations } from "./ai";
import { CountdownRing, ResultBars } from "./live";
import { Spinner, useToast } from "./ui";

export type Draft = { question: string; options: string[]; correct: number[]; duration: number; explanation: string; documentId?: string };
export const emptyDraft = (): Draft => ({ question: "", options: ["", "", "", ""], correct: [], duration: 30, explanation: "" });
export const draftFrom = (q: { question: string; options: string[]; correctOptions: number[]; explanation?: string | null }, documentId?: string): Draft => ({
  question: q.question,
  options: [...q.options],
  correct: [...q.correctOptions],
  duration: 30,
  explanation: q.explanation ?? "",
  documentId,
});
/** Blank option boxes are simply dropped, with the correct-answer indexes shifted to match. */
export const toPollInput = (d: Draft): PollInput => {
  const kept = d.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
  return {
  question: d.question.trim(),
  options: kept.map((x) => x.o),
  correctOptions: kept.flatMap((x, j) => (d.correct.includes(x.i) ? [j] : [])),
  durationSec: d.duration,
  explanation: d.explanation.trim() || undefined,
  documentId: d.documentId,
  };
};

/* ---------------- composer ---------------- */
export function PollComposer({ draft, setDraft, onLaunch, disabled }: { draft: Draft; setDraft: (d: Draft) => void; onLaunch: () => Promise<void>; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const filled = draft.options.filter((o) => o.trim()).length;
  const correctFilled = draft.correct.some((i) => draft.options[i]?.trim());
  const valid = draft.question.trim() && filled >= 2 && correctFilled;
  const hint = !draft.question.trim()
    ? "Write a question"
    : filled < 2
      ? "Add at least two options"
      : !correctFilled
        ? "Tick the correct answer"
        : filled < draft.options.length
          ? "Empty options will be left out"
          : null;

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="field">
        <div className="row between">
          <label htmlFor="q">Question</label>
          <span className="tiny muted">{draft.question.length}/{LIMITS.questionMax}</span>
        </div>
        <textarea
          id="q"
          className="textarea"
          style={{ fontSize: 17, fontWeight: 600, minHeight: 90 }}
          placeholder="What do you want to ask the class?"
          maxLength={LIMITS.questionMax}
          value={draft.question}
          onChange={(e) => setDraft({ ...draft, question: e.target.value })}
          data-testid="poll-question"
        />
      </div>

      <div className="col" style={{ gap: 10 }}>
        <div className="row between">
          <span className="label">Options</span>
          <span className="tiny muted">Tick the correct answer(s)</span>
        </div>
        {draft.options.map((opt, i) => {
          const on = draft.correct.includes(i);
          return (
            <div key={i} className="row" style={{ gap: 10 }}>
              <span className="opt-letter" style={{ ["--c" as string]: OPTION_COLORS[i] }}>{letter(i)}</span>
              <input
                className="input"
                placeholder={`Option ${letter(i)}`}
                value={opt}
                maxLength={LIMITS.optionMax}
                onChange={(e) => setDraft({ ...draft, options: draft.options.map((o, j) => (j === i ? e.target.value : o)) })}
                data-testid={`poll-option-${i}`}
              />
              <button
                type="button"
                className={`check ${on ? "on" : ""}`}
                aria-pressed={on}
                aria-label={`Mark option ${letter(i)} correct`}
                onClick={() => setDraft({ ...draft, correct: on ? draft.correct.filter((c) => c !== i) : [...draft.correct, i].sort() })}
                data-testid={`poll-correct-${i}`}
              >
                {on && <Check size={14} strokeWidth={3.5} />}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                aria-label={`Remove option ${letter(i)}`}
                disabled={draft.options.length <= LIMITS.minOptions}
                onClick={() =>
                  setDraft({
                    ...draft,
                    options: draft.options.filter((_, j) => j !== i),
                    correct: draft.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)),
                  })
                }
              >
                <X size={15} />
              </button>
            </div>
          );
        })}
        {draft.options.length < LIMITS.maxOptions && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setDraft({ ...draft, options: [...draft.options, ""] })}>
            <Plus size={15} /> Add option
          </button>
        )}
      </div>

      <div className="row wrap" style={{ gap: 18, alignItems: "flex-start" }}>
        <div className="col" style={{ gap: 8 }}>
          <span className="label row" style={{ gap: 6 }}><Timer size={14} /> Time limit</span>
          <div className="chips">
            {LIMITS.durations.map((d) => (
              <button key={d} type="button" className={`chip ${draft.duration === d ? "active" : ""}`} onClick={() => setDraft({ ...draft, duration: d })}>
                {d < 60 ? `${d}s` : `${Math.floor(d / 60)}m${d % 60 ? ` ${d % 60}s` : ""}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <details>
        <summary className="label" style={{ cursor: "pointer" }}>Explanation shown after the reveal (optional)</summary>
        <textarea className="textarea" style={{ marginTop: 8, minHeight: 64 }} maxLength={1000} placeholder="Why is the answer right?" value={draft.explanation} onChange={(e) => setDraft({ ...draft, explanation: e.target.value })} />
      </details>

      <div className="row between wrap">
        <span className="small muted">{hint ?? (disabled ? "Wait for the current question to finish" : "Ready to go")}</span>
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={() => setDraft(emptyDraft())}>Clear</button>
          <button
            className="btn btn-primary btn-lg"
            disabled={!valid || busy || disabled}
            onClick={async () => {
              setBusy(true);
              await onLaunch();
              setBusy(false);
            }}
            data-testid="poll-launch"
          >
            {busy ? <Spinner /> : <><Rocket size={18} /> Ask the class</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- AI quiz generator ---------------- */
const STRATEGY_INFO: Record<RagStrategy, string> = {
  hybrid: "Hybrid: vector + keyword search (recommended)",
  vector: "Vector: embeddings only",
  hyde: "HyDE: search with a hypothetical answer",
  crag: "CRAG: AI grades and re-searches",
  graph: "GraphRAG: follows the concept graph",
};

function QuestionCard({ q, onLaunch, onEdit, disabled }: { q: QuizQuestionDraft; onLaunch: () => void; onEdit: () => void; disabled?: boolean }) {
  return (
    <div className="card fade-up" style={{ padding: 16, boxShadow: "var(--shadow-sm)" }} data-testid="ai-question">
      <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
        <span className={`badge ${q.difficulty === "hard" ? "badge-red" : q.difficulty === "easy" ? "badge-green" : "badge-brand"}`}>{q.difficulty}</span>
        <span className="badge">{q.bloomLevel}</span>
        {q.concept && <span className="badge">{q.concept}</span>}
      </div>
      <div className="bold" style={{ marginBottom: 10 }}>{q.question}</div>
      <div className="col" style={{ gap: 6 }}>
        {q.options.map((o, i) => (
          <div key={i} className="row small" style={{ gap: 8 }}>
            <span className="opt-letter" style={{ ["--c" as string]: OPTION_COLORS[i], width: 22, height: 22, fontSize: 11, borderRadius: 7 }}>{letter(i)}</span>
            <span className={q.correctOptions.includes(i) ? "bold" : "text-2"}>{o}</span>
            {q.correctOptions.includes(i) && <Check size={14} color="var(--green)" strokeWidth={3} />}
          </div>
        ))}
      </div>
      {q.explanation && <div className="small muted" style={{ marginTop: 10 }}>💡 {q.explanation}</div>}
      <Citations items={q.citations.slice(0, 2)} />
      <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
        <button className="btn btn-sm" onClick={onEdit}>
          <Pencil size={14} /> Edit
        </button>
        <button className="btn btn-sm btn-primary" onClick={onLaunch} disabled={disabled} data-testid="ai-question-launch">
          <Play size={14} /> Launch
        </button>
      </div>
    </div>
  );
}

export function AiQuizPanel({
  token,
  sessionId,
  onAi,
  attached,
  setAttached,
  onEdit,
  onLaunch,
  pollRunning,
}: {
  token: string;
  sessionId: string;
  onAi: LiveActions["onAi"];
  attached: string[];
  setAttached: (ids: string[]) => void;
  onEdit: (d: Draft) => void;
  onLaunch: (d: Draft) => Promise<boolean>;
  pollRunning: boolean;
}) {
  const toast = useToast();
  const [docs, setDocs] = useState<DocumentInfo[] | null>(null);
  const [docId, setDocId] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(3);
  const [difficulty, setDifficulty] = useState<"mixed" | "easy" | "medium" | "hard">("mixed");
  const [strategy, setStrategy] = useState<RagStrategy>("hybrid");
  const [launched, setLaunched] = useState<Set<string>>(new Set());
  const job = useAiJob<QuizDraft>(onAi, token);

  useEffect(() => {
    api<{ documents: DocumentInfo[] }>("/api/documents", { token }).then((r) => {
      const ready = r.documents.filter((d) => d.status === "ready");
      setDocs(ready);
      setDocId((cur) => cur || attached[0] || ready[0]?.id || "");
    });
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAttach = async (id: string) => {
    const next = attached.includes(id) ? attached.filter((x) => x !== id) : [...attached, id];
    try {
      const r = await api<{ documentIds: string[] }>(`/api/sessions/${sessionId}/documents`, { token, method: "PUT", body: { documentIds: next } });
      setAttached(r.documentIds);
      toast(r.documentIds.length ? "Tutor is on for students" : "Tutor turned off");
    } catch (err) {
      toast((err as Error).message, "error");
    }
  };

  const questions = (job.output?.questions ?? (job.partials as QuizQuestionDraft[])) as QuizQuestionDraft[];

  if (docs && !docs.length)
    return (
      <div className="ai-surface col" style={{ alignItems: "center", textAlign: "center", padding: 28 }}>
        <Sparkles size={26} color="var(--brand)" />
        <div className="bold">Upload course material first</div>
        <div className="small text-2">Add a PDF or notes in your dashboard's Course library. The local AI will write questions from it.</div>
      </div>
    );

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="ai-surface col" style={{ gap: 14 }}>
        <AiLabel>Generate questions from your material</AiLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="doc">Document</label>
            <select id="doc" className="select" value={docId} onChange={(e) => setDocId(e.target.value)} data-testid="ai-doc">
              {docs?.map((d) => (
                <option key={d.id} value={d.id}>{d.title}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="topic">Focus topic (optional)</label>
            <input id="topic" className="input" placeholder="e.g. the Calvin cycle (leave empty to cover key concepts)" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} data-testid="ai-topic" />
          </div>
          <div className="field">
            <label>Questions</label>
            <div className="chips">
              {[1, 2, 3, 5].map((n) => (
                <button key={n} type="button" className={`chip ${count === n ? "active" : ""}`} onClick={() => setCount(n)} data-testid={`ai-count-${n}`}>{n}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Difficulty</label>
            <div className="chips">
              {(["mixed", "easy", "medium", "hard"] as const).map((d) => (
                <button key={d} type="button" className={`chip ${difficulty === d ? "active" : ""}`} onClick={() => setDifficulty(d)}>{d}</button>
              ))}
            </div>
          </div>
        </div>
        <details>
          <summary className="small bold text-2" style={{ cursor: "pointer" }}>
            Retrieval strategy · <span className="mono">{strategy}</span>
          </summary>
          <select className="select" style={{ marginTop: 8 }} value={strategy} onChange={(e) => setStrategy(e.target.value as RagStrategy)}>
            {RAG_STRATEGIES.map((s) => (
              <option key={s} value={s}>{STRATEGY_INFO[s]}</option>
            ))}
          </select>
        </details>
        <div className="row between wrap">
          <span className="tiny muted">Runs on your machine. About 30–60s per question on a laptop CPU.</span>
          <button
            className="btn btn-primary"
            disabled={!docId || job.busy}
            onClick={() => job.start(() => api<{ jobId: string }>("/api/ai/quiz", { token, body: { documentId: docId, topic: topic.trim() || undefined, count, difficulty, strategy } }))}
            data-testid="ai-generate"
          >
            {job.busy ? <Spinner /> : <Wand2 size={17} />} {job.busy ? "Generating…" : "Generate"}
          </button>
        </div>
        {job.busy && (
          <div className="col" style={{ gap: 6 }}>
            <div className="row between tiny">
              <span className="text-2 bold">{job.message || "Starting…"}</span>
              <span className="muted">{job.progress}%</span>
            </div>
            <div className="progress"><span style={{ width: `${Math.max(4, job.progress)}%` }} /></div>
          </div>
        )}
        {job.status === "failed" && <div className="badge badge-red" style={{ height: "auto", padding: "8px 12px", whiteSpace: "normal" }}>{job.error}</div>}
      </div>

      {questions.length > 0 && (
        <div className="col" style={{ gap: 12 }}>
          <div className="row between">
            <div className="section-title">{questions.length} draft question{questions.length > 1 ? "s" : ""}</div>
            {job.status === "done" && <span className="tiny muted">via {job.output?.strategy} · {job.output?.model}</span>}
          </div>
          {questions.map((q, i) => (
            <QuestionCard
              key={q.question + i}
              q={q}
              disabled={pollRunning || launched.has(q.question)}
              onEdit={() => onEdit(draftFrom(q, docId))}
              onLaunch={async () => {
                if (await onLaunch(draftFrom(q, docId))) setLaunched(new Set(launched).add(q.question));
              }}
            />
          ))}
          {job.busy && <div className="shimmer" style={{ height: 160 }} />}
        </div>
      )}

      <div className="card" style={{ padding: 16, boxShadow: "none" }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <ListChecks size={16} />
          <span className="bold small grow">Material for the student tutor</span>
          <span className={`badge ${attached.length ? "badge-green" : ""}`}>{attached.length ? "Tutor on" : "Tutor off"}</span>
        </div>
        <div className="col" style={{ gap: 6 }}>
          {docs?.map((d) => (
            <label key={d.id} className="row small" style={{ cursor: "pointer", gap: 10 }}>
              <button type="button" className={`check ${attached.includes(d.id) ? "on" : ""}`} onClick={() => toggleAttach(d.id)} aria-pressed={attached.includes(d.id)} data-testid="attach-doc">
                {attached.includes(d.id) && <Check size={14} strokeWidth={3.5} />}
              </button>
              {d.title}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- live poll ---------------- */
export function LivePollCard({ poll, progress, onEnd }: { poll: PublicPoll; progress: PollProgress | null; onEnd: () => void }) {
  const secs = useCountdown(poll.endsAt);
  const answered = progress?.answered ?? 0;
  const total = progress?.total ?? 0;
  return (
    <div className="card fade-up" style={{ padding: 24, borderColor: "color-mix(in srgb, var(--brand) 40%, var(--border))", boxShadow: "var(--shadow-lg)" }} data-testid="live-poll">
      <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
        <CountdownRing seconds={secs} total={poll.durationSec} size={84} />
        <div className="grow col" style={{ gap: 8 }}>
          <span className="badge badge-brand" style={{ alignSelf: "flex-start" }}>
            <span className="dot dot-green pulse-dot" style={{ color: "var(--green)" }} /> Live · Question {poll.seq}
          </span>
          <h2 style={{ fontSize: 22 }}>{poll.question}</h2>
        </div>
      </div>
      <div className="options" style={{ marginTop: 20 }}>
        {poll.options.map((o, i) => (
          <div key={i} className="option" style={{ ["--c" as string]: OPTION_COLORS[i], cursor: "default", minHeight: 56 }}>
            <span className="opt-letter">{letter(i)}</span>
            {o}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 22 }}>
        <div className="row between small" style={{ marginBottom: 8 }}>
          <span className="bold" data-testid="live-progress">
            {answered} of {total} answered
          </span>
          <span className="muted">Ends automatically when everyone has answered</span>
        </div>
        <div className="progress" style={{ height: 10 }}>
          <span style={{ width: `${total ? (answered / total) * 100 : 0}%` }} />
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 18 }}>
        <button className="btn" onClick={onEnd} data-testid="poll-end">
          <Square size={15} /> End now &amp; reveal
        </button>
      </div>
    </div>
  );
}

/* ---------------- results history ---------------- */
function InsightBox({ insight, pending, onFollowUp }: { insight?: AiInsight; pending: boolean; onFollowUp: (d: Draft) => void }) {
  if (!insight && !pending) return null;
  if (!insight)
    return (
      <div className="ai-surface col" style={{ gap: 8 }}>
        <AiLabel>Analysing answers locally…</AiLabel>
        <div className="shimmer" style={{ height: 14, width: "80%" }} />
        <div className="shimmer" style={{ height: 14, width: "55%" }} />
      </div>
    );
  return (
    <div className="ai-surface col" style={{ gap: 8 }} data-testid="insight">
      <AiLabel>Insight</AiLabel>
      <div className="small bold">{insight.summary}</div>
      {insight.misconception && (
        <div className="row small text-2" style={{ alignItems: "flex-start", gap: 8 }}>
          <Lightbulb size={16} style={{ flex: "none", marginTop: 2, color: "var(--amber)" }} />
          {insight.misconception}
        </div>
      )}
      {insight.followUp && (
        <div className="card" style={{ padding: 12, boxShadow: "none" }}>
          <div className="tiny muted bold" style={{ marginBottom: 4 }}>SUGGESTED FOLLOW-UP</div>
          <div className="small bold">{insight.followUp.question}</div>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
            <button className="btn btn-sm btn-primary" onClick={() => onFollowUp(draftFrom(insight.followUp!))}>
              <Pencil size={13} /> Use this question
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ResultsHistory({ history, insights, aiOn, onFollowUp }: { history: PollResult[]; insights: Record<string, AiInsight>; aiOn: boolean; onFollowUp: (d: Draft) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const latest = history.at(-1)?.id;
  if (!history.length) return null;
  return (
    <div className="col" style={{ gap: 12 }}>
      <div className="section-title">Results · {history.length} question{history.length > 1 ? "s" : ""}</div>
      {[...history].reverse().map((r) => {
        const expanded = (open ?? latest) === r.id;
        const acc = accuracy(r);
        return (
          <div key={r.id} className="card" data-testid="history-item">
            <button className="row" style={{ width: "100%", padding: "16px 20px", background: "none", border: 0, cursor: "pointer", textAlign: "left" }} onClick={() => setOpen(expanded ? "none" : r.id)}>
              <span className="badge">Q{r.seq}</span>
              <span className="grow bold">{r.question}</span>
              {acc !== null && <span className={`badge ${acc >= 70 ? "badge-green" : acc >= 40 ? "badge-brand" : "badge-red"}`}>{acc}% correct</span>}
              <span className="small muted">{r.totalResponses} answers</span>
              <ChevronDown size={18} style={{ transform: expanded ? "rotate(180deg)" : undefined, transition: "transform .2s" }} />
            </button>
            {expanded && (
              <div className="col" style={{ padding: "0 20px 20px", gap: 14 }}>
                <ResultBars result={r} />
                {r.explanation && <div className="small text-2">💡 {r.explanation}</div>}
                {aiOn && <InsightBox insight={insights[r.id]} pending={r.totalResponses > 0 && !insights[r.id] && r.id === latest} onFollowUp={onFollowUp} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- assistant ---------------- */
const SUGGESTIONS = ["Which questions did the class struggle with?", "Who might need extra help?", "What should I reteach next?"];

export function AssistantPanel({ token, sessionId, onAi }: { token: string; sessionId: string; onAi: LiveActions["onAi"] }) {
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const job = useAiJob<{ answer: string }>(onAi, token);
  const ask = (question: string) => {
    setAsked(question);
    setQ("");
    void job.start(() => api<{ jobId: string }>(`/api/ai/sessions/${sessionId}/assistant`, { token, body: { question } }));
  };
  const text = job.text || job.output?.answer || "";
  return (
    <div className="col" style={{ padding: 16, gap: 14, height: "100%" }}>
      <div className="ai-surface small text-2">
        <AiLabel>Teaching assistant</AiLabel>
        <div style={{ marginTop: 4 }}>Ask about this class. It reads the live results (never invents numbers) and runs privately on your machine.</div>
      </div>
      <div className="grow scroll-y col" style={{ gap: 10, minHeight: 120 }}>
        {asked && (
          <div className="msg me" style={{ maxWidth: "100%" }}>
            <div className="bubble">{asked}</div>
          </div>
        )}
        {job.status !== "idle" && (
          <div className="msg" style={{ maxWidth: "100%" }}>
            <div className={`bubble ${job.busy ? "typing" : ""}`} data-testid="assistant-answer">
              {text || (job.busy ? <span className="muted">{job.status === "queued" ? "Waiting for the local model…" : "Thinking…"}</span> : null)}
              {job.status === "failed" && <span style={{ color: "var(--red)" }}>{job.error}</span>}
            </div>
          </div>
        )}
        {job.status === "idle" && (
          <div className="col" style={{ gap: 8 }}>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="btn btn-sm" style={{ justifyContent: "flex-start", height: "auto", padding: "8px 12px", whiteSpace: "normal", textAlign: "left" }} onClick={() => ask(s)}>
                <Sparkles size={14} color="var(--brand)" /> {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask(q.trim());
        }}
      >
        <input className="input" placeholder="Ask about your class…" value={q} maxLength={2000} onChange={(e) => setQ(e.target.value)} disabled={job.busy} />
        <button className="btn btn-primary btn-icon" disabled={!q.trim() || job.busy} aria-label="Ask">
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}

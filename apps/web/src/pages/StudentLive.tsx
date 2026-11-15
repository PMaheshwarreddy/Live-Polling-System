import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import { Activity, BookOpenCheck, Check, CheckCircle2, Flame, Lock, LogOut, MessageCircle, PartyPopper, Send, Trophy, UserX, WifiOff, XCircle } from "lucide-react";
import type { PollResult, PublicPoll, TutorAnswer } from "@classpulse/shared";
import { AiLabel, Citations } from "../components/ai";
import { ChatPanel, CountdownRing, ResultBars } from "../components/live";
import { Avatar, Logo, Spinner, ThemeToggle } from "../components/ui";
import { api } from "../lib/api";
import { useAiJob } from "../lib/aiJob";
import { studentAuth } from "../lib/auth";
import { OPTION_COLORS, letter } from "../lib/format";
import { useCountdown, useLive, type LiveActions } from "../lib/live";

/** Remembers which option this student picked for each poll, so the score survives a refresh. */
function useMyAnswers(participantId: string) {
  const key = `cp.answers.${participantId}`;
  const [map, setMap] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}");
    } catch {
      return {};
    }
  });
  const set = (pollId: string, idx: number) =>
    setMap((m) => {
      const next = { ...m, [pollId]: idx };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  return [map, set] as const;
}

function Waiting({ name, first }: { name: string; first: boolean }) {
  return (
    <div className="col fade-up" style={{ alignItems: "center", textAlign: "center", gap: 18, padding: "48px 16px" }} data-testid="waiting">
      <div style={{ position: "relative", width: 120, height: 120, display: "grid", placeItems: "center" }}>
        <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "var(--grad)", opacity: 0.18, animation: "ping 2.2s cubic-bezier(0,0,.2,1) infinite" }} />
        <span style={{ position: "absolute", inset: 14, borderRadius: "50%", background: "var(--grad)", opacity: 0.28, animation: "ping 2.2s .4s cubic-bezier(0,0,.2,1) infinite" }} />
        <span className="logo-mark" style={{ width: 72, height: 72, borderRadius: "50%" }}>
          <Activity size={36} strokeWidth={2.6} />
        </span>
      </div>
      <h2 style={{ fontSize: 26 }}>{first ? `You're in, ${name}!` : "Nice one. Get ready for the next question."}</h2>
      <p className="text-2" style={{ maxWidth: 380 }}>Keep this page open. The question will appear here as soon as your teacher sends it.</p>
    </div>
  );
}

function Question({ poll, myAnswer, onAnswer }: { poll: PublicPoll; myAnswer: number | null; onAnswer: (i: number) => void }) {
  const secs = useCountdown(poll.endsAt);
  const locked = myAnswer !== null;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || locked || secs === 0) return;
      const n = Number(e.key);
      if (n >= 1 && n <= poll.options.length) onAnswer(n - 1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [locked, secs, poll.options.length, onAnswer]);

  return (
    <div className="col fade-up" style={{ gap: 22 }} data-testid="question">
      <div className="row" style={{ gap: 18, alignItems: "flex-start" }}>
        <CountdownRing seconds={secs} total={poll.durationSec} size={76} />
        <div className="col grow" style={{ gap: 6 }}>
          <span className="section-title">Question {poll.seq}</span>
          <h2 style={{ fontSize: "clamp(20px, 3vw, 28px)" }}>{poll.question}</h2>
        </div>
      </div>
      <div className="options">
        {poll.options.map((o, i) => (
          <button
            key={i}
            className={`option ${myAnswer === i ? "selected" : ""}`}
            style={{ ["--c" as string]: OPTION_COLORS[i] }}
            disabled={locked || secs === 0}
            onClick={() => onAnswer(i)}
            data-testid={`answer-${i}`}
          >
            <span className="opt-letter">{letter(i)}</span>
            <span className="grow">{o}</span>
            {myAnswer === i ? <Check size={20} strokeWidth={3} color="var(--c)" /> : <span className="kbd">{i + 1}</span>}
          </button>
        ))}
      </div>
      {locked ? (
        <div className="row center fade-up" style={{ gap: 10, color: "var(--text-2)" }} data-testid="locked">
          <Lock size={16} /> <b>Answer locked in.</b> Results appear when time's up or everyone has answered.
        </div>
      ) : (
        <div className="small muted" style={{ textAlign: "center" }}>Tap an answer, or press 1–{poll.options.length} on your keyboard.</div>
      )}
    </div>
  );
}

function Reveal({ result, mine }: { result: PollResult; mine: number | undefined }) {
  const right = mine !== undefined && result.correctOptions.includes(mine);
  const skipped = mine === undefined;
  useEffect(() => {
    if (!right) return;
    void confetti({ particleCount: 140, spread: 80, origin: { y: 0.35 }, colors: ["#6d4aff", "#ff4d8d", "#12b76a", "#ffb020"], disableForReducedMotion: true });
  }, [right, result.id]);
  return (
    <div className="col fade-up" style={{ gap: 20 }} data-testid="reveal">
      <div
        className="row"
        style={{
          gap: 14,
          padding: 18,
          borderRadius: 18,
          background: right ? "var(--green-soft)" : skipped ? "var(--bg-sunken)" : "var(--red-soft)",
          color: right ? "var(--green)" : skipped ? "var(--text-2)" : "var(--red)",
        }}
      >
        {right ? <PartyPopper size={30} /> : skipped ? <Lock size={28} /> : <XCircle size={30} />}
        <div>
          <div className="bold" style={{ fontSize: 20 }} data-testid="verdict">
            {right ? "Correct! 🎉" : skipped ? "Time's up" : "Not quite"}
          </div>
          <div className="small" style={{ opacity: 0.9 }}>
            {right
              ? "You nailed it."
              : `The answer was ${result.correctOptions.map((i) => `“${result.options[i]}”`).join(" or ")}.`}
          </div>
        </div>
      </div>
      <h3 style={{ fontSize: 20 }}>{result.question}</h3>
      <ResultBars result={result} mine={mine ?? null} />
      {result.explanation && (
        <div className="ai-surface small">
          <b>Why: </b>
          {result.explanation}
        </div>
      )}
      <div className="row center small muted" style={{ gap: 8 }}>
        <Spinner size={14} /> Waiting for the next question…
      </div>
    </div>
  );
}

function Tutor({ token, onAi, available, paused }: { token: string; onAi: LiveActions["onAi"]; available: boolean; paused: boolean }) {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<{ q: string; a: TutorAnswer | null; error?: string }[]>([]);
  const job = useAiJob<TutorAnswer & { trace?: string[] }>(onAi, token);
  const scroller = useRef<HTMLDivElement>(null);
  // The newest question is answered by the live job; older ones keep the answer they got.
  const entries = log.map((x, i) =>
    i === log.length - 1 && !x.a && !x.error
      ? { ...x, a: job.status === "done" ? job.output : null, error: job.status === "failed" ? (job.error ?? "Failed") : undefined, live: job.busy }
      : { ...x, live: false },
  );

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [job.text, log.length]);

  if (!available)
    return (
      <div className="empty">
        <div className="icon"><BookOpenCheck size={22} /></div>
        <div className="bold text-2">Tutor not available yet</div>
        <div className="small">It switches on when your teacher adds course material.</div>
      </div>
    );

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || job.busy) return;
    setQ("");
    setLog([...entries.map(({ live: _live, ...x }) => x), { q: question, a: null }]);
    void job.start(() => api<{ jobId: string }>("/api/ai/tutor", { token, body: { question } }));
  };

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scroller}>
        <div className="ai-surface small text-2">
          <AiLabel>Course tutor</AiLabel>
          <div style={{ marginTop: 4 }}>Answers come only from your teacher's material, with sources. It pauses during live questions.</div>
        </div>
        {entries.map((x, i) => {
          const live = x.live;
          const text = live ? job.text : (x.a?.answer ?? (i === entries.length - 1 ? job.text : ""));
          return (
            <div key={i} className="col" style={{ gap: 8 }}>
              <div className="msg me">
                <div className="bubble">{x.q}</div>
              </div>
              <div className="msg" style={{ maxWidth: "100%" }}>
                <div className={`bubble ${live ? "typing" : ""}`} data-testid="tutor-answer">
                  {text || (live ? <span className="muted">{job.status === "queued" ? "Waiting for the local model…" : "Looking through your course material…"}</span> : null)}
                  {x.error && <span style={{ color: "var(--red)" }}>{x.error}</span>}
                  {x.a && <Citations items={x.a.citations} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <form className="chat-input" onSubmit={ask}>
        <input
          className="input"
          placeholder={paused ? "Paused while a question is live" : "Ask about the lesson…"}
          value={q}
          maxLength={1000}
          disabled={paused || job.busy}
          onChange={(e) => setQ(e.target.value)}
          data-testid="tutor-input"
        />
        <button className="btn btn-primary btn-icon" disabled={!q.trim() || paused || job.busy} aria-label="Ask the tutor">
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}

function EndScreen({ icon, title, text, score }: { icon: React.ReactNode; title: string; text: string; score?: { correct: number; total: number } }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card col fade-up" style={{ padding: 36, gap: 14, alignItems: "center", textAlign: "center", width: "min(440px, 100%)" }} data-testid="end-screen">
        <div className="empty" style={{ padding: 0 }}>
          <div className="icon" style={{ width: 64, height: 64 }}>{icon}</div>
        </div>
        <h1 style={{ fontSize: 26 }}>{title}</h1>
        <p className="text-2">{text}</p>
        {score && score.total > 0 && (
          <div className="ai-surface row" style={{ gap: 12 }}>
            <Trophy color="var(--amber)" />
            <div>
              <div className="bold" style={{ fontSize: 22 }}>{score.correct} / {score.total}</div>
              <div className="tiny muted">correct answers</div>
            </div>
          </div>
        )}
        <Link to="/" className="btn btn-primary">Back to home</Link>
      </div>
    </div>
  );
}

export function StudentLive() {
  const { code = "" } = useParams();
  const nav = useNavigate();
  const auth = useMemo(() => studentAuth.get(code), [code]);
  const liveAuth = useMemo(() => (auth ? { token: auth.token } : null), [auth]);
  const { state, actions } = useLive(liveAuth);
  const [answers, setAnswer] = useMyAnswers(auth?.participant.id ?? "none");
  const [panelChoice, setPanelChoice] = useState<"chat" | "tutor" | null>(null);
  const [seenChat, setSeenChat] = useState(0);
  // Until the student picks a tab, open the tutor when it's available and the chat is still empty.
  const panel = panelChoice ?? (state.snapshot?.tutorAvailable && state.chat.length === 0 ? "tutor" : "chat");
  const setPanel = (p: "chat" | "tutor") => {
    setSeenChat(state.chat.length);
    setPanelChoice(p);
  };
  // Keep the remembered answer for the active poll in sync with the server (e.g. after a refresh).
  useEffect(() => {
    if (state.activePoll && state.myAnswer !== null && answers[state.activePoll.id] === undefined) setAnswer(state.activePoll.id, state.myAnswer);
  }, [state.activePoll, state.myAnswer]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!auth) return <Navigate to={`/join/${code}`} replace />;

  const scored = state.history.filter((h) => answers[h.id] !== undefined);
  const correct = scored.filter((h) => h.correctOptions.includes(answers[h.id]!)).length;
  let streak = 0;
  for (const h of [...state.history].reverse()) {
    if (answers[h.id] !== undefined && h.correctOptions.includes(answers[h.id]!)) streak++;
    else break;
  }

  if (state.status === "kicked")
    return <EndScreen icon={<UserX size={28} />} title="You were removed" text="Your teacher removed you from this session. If that's a mistake, ask them for help." />;
  if (state.status === "closed")
    return <EndScreen icon={<CheckCircle2 size={28} />} title="That's a wrap!" text="Your teacher ended the session. Thanks for taking part." score={{ correct, total: state.history.length }} />;
  if (state.status === "error")
    return (
      <EndScreen
        icon={<LogOut size={28} />}
        title="Please join again"
        text={state.error ?? "Your login for this session expired."}
      />
    );

  const unread = panel === "chat" ? 0 : Math.max(0, state.chat.length - seenChat);
  const me = auth.participant;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="topbar">
        <div className="container topbar-inner">
          <Logo size={30} />
          <span className="muted hide-sm">/</span>
          <span className="bold hide-sm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{auth.session.title}</span>
          <div className="grow" />
          {state.status !== "live" && (
            <span className="badge badge-red">
              <WifiOff size={13} /> {state.status === "connecting" ? "Connecting…" : "Reconnecting…"}
            </span>
          )}
          {state.history.length > 0 && (
            <span className="badge badge-brand" title="Correct answers" data-testid="score">
              <Trophy size={13} /> {correct}/{state.history.length}
            </span>
          )}
          {streak >= 2 && (
            <span className="badge" style={{ color: "var(--amber)" }}>
              <Flame size={13} /> {streak}
            </span>
          )}
          <ThemeToggle />
          <Avatar name={me.name} small />
          <button
            className="btn btn-ghost btn-icon btn-sm"
            title="Leave"
            aria-label="Leave session"
            onClick={() => {
              if (!confirm("Leave this session?")) return;
              studentAuth.set(code, null);
              nav("/");
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      <main className="container student-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 20, padding: "24px 20px 32px", flex: 1, alignItems: "start" }}>
        <section className="card" style={{ padding: "clamp(18px, 4vw, 32px)", minHeight: 420 }}>
          {state.status === "connecting" && !state.snapshot ? (
            <div style={{ display: "grid", placeItems: "center", minHeight: 360 }}>
              <Spinner size={28} />
            </div>
          ) : state.activePoll ? (
            <Question
              key={state.activePoll.id}
              poll={state.activePoll}
              myAnswer={state.myAnswer}
              onAnswer={async (i) => {
                const pollId = state.activePoll!.id;
                const res = await actions.answer(pollId, i);
                if (res.ok || res.error === "You already answered") setAnswer(pollId, i);
              }}
            />
          ) : state.justEnded ? (
            <Reveal result={state.justEnded} mine={answers[state.justEnded.id]} />
          ) : (
            <Waiting name={me.name} first={state.history.length === 0} />
          )}
        </section>

        <aside className="card" style={{ height: "min(640px, calc(100vh - 120px))", display: "flex", flexDirection: "column", overflow: "hidden", position: "sticky", top: 84 }}>
          <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
            <div className="tabs" style={{ width: "100%" }}>
              <button className={`tab grow ${panel === "chat" ? "active" : ""}`} style={{ justifyContent: "center" }} onClick={() => setPanel("chat")}>
                <MessageCircle size={15} /> Class chat {unread > 0 && <span className="count">{unread}</span>}
              </button>
              <button className={`tab grow ${panel === "tutor" ? "active" : ""}`} style={{ justifyContent: "center" }} onClick={() => setPanel("tutor")} data-testid="tab-tutor">
                <BookOpenCheck size={15} /> AI tutor
              </button>
            </div>
          </div>
          <div className="grow" style={{ minHeight: 0 }}>
            {panel === "chat" ? (
              <ChatPanel messages={state.chat} myId={me.id} onSend={actions.sendChat} />
            ) : (
              <Tutor token={auth.token} onAi={actions.onAi} available={Boolean(state.snapshot?.tutorAvailable)} paused={Boolean(state.activePoll)} />
            )}
          </div>
        </aside>
      </main>
      <style>{`@media (max-width: 900px){ .student-grid{ grid-template-columns: 1fr !important; } .student-grid aside{ position: static !important; height: 480px !important; } } @media (max-width: 560px){ .hide-sm{ display:none } }`}</style>
    </div>
  );
}

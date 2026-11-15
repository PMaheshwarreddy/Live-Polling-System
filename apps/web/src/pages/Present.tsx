import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { Users } from "lucide-react";
import { CountdownRing, QrCode, ResultBars } from "../components/live";
import { Logo, Spinner } from "../components/ui";
import { useTeacher } from "../lib/auth";
import { OPTION_COLORS, letter } from "../lib/format";
import { useCountdown, useLive } from "../lib/live";

/** Full-screen view for the classroom projector. Read-only: the teacher drives from the console. */
export function Present() {
  const { id = "" } = useParams();
  const auth = useTeacher()!;
  const liveAuth = useMemo(() => ({ token: auth.token, sessionId: id }), [auth.token, id]);
  const { state } = useLive(liveAuth);
  const secs = useCountdown(state.activePoll?.endsAt);
  const s = state.snapshot?.session;
  if (!s)
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <Spinner size={32} />
      </div>
    );
  const joinUrl = `${window.location.origin}/join/${s.code}`;
  const online = state.participants.filter((p) => p.online).length;
  const shown = state.activePoll ? null : (state.justEnded ?? null);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", padding: "28px 44px" }}>
      <div className="row between">
        <Logo size={40} />
        <div className="row" style={{ gap: 22, fontSize: 20 }}>
          <span className="row bold" style={{ gap: 8 }}>
            <Users /> {online}
          </span>
          <span className="code-pill" style={{ fontSize: 26 }}>{s.code}</span>
        </div>
      </div>

      <div className="grow" style={{ display: "grid", placeItems: "center", padding: "24px 0" }}>
        {state.activePoll ? (
          <div className="col fade-up" style={{ width: "min(1200px, 100%)", gap: 34 }} key={state.activePoll.id}>
            <div className="row" style={{ gap: 30 }}>
              <CountdownRing seconds={secs} total={state.activePoll.durationSec} size={130} stroke={11} />
              <h1 style={{ fontSize: "clamp(30px, 4vw, 54px)", letterSpacing: "-0.03em" }}>{state.activePoll.question}</h1>
            </div>
            <div className="options" style={{ gap: 18 }}>
              {state.activePoll.options.map((o, i) => (
                <div key={i} className="option" style={{ ["--c" as string]: OPTION_COLORS[i], minHeight: 100, fontSize: 28, cursor: "default" }}>
                  <span className="opt-letter" style={{ width: 54, height: 54, fontSize: 24, borderRadius: 16 }}>{letter(i)}</span>
                  {o}
                </div>
              ))}
            </div>
            <div>
              <div className="row between" style={{ fontSize: 22, marginBottom: 10 }}>
                <b>{state.progress?.answered ?? 0} answered</b>
                <span className="muted">of {state.progress?.total ?? online}</span>
              </div>
              <div className="progress" style={{ height: 16 }}>
                <span style={{ width: `${state.progress?.total ? (state.progress.answered / state.progress.total) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        ) : shown ? (
          <div className="col fade-up" style={{ width: "min(1100px, 100%)", gap: 28 }} key={shown.id}>
            <h1 style={{ fontSize: "clamp(28px, 3.5vw, 48px)" }}>{shown.question}</h1>
            <ResultBars result={shown} big />
            {shown.explanation && <div className="ai-surface" style={{ fontSize: 22 }}>💡 {shown.explanation}</div>}
          </div>
        ) : (
          <div className="row fade-up" style={{ gap: 64, flexWrap: "wrap", justifyContent: "center", textAlign: "center" }}>
            <QrCode text={joinUrl} size={340} />
            <div className="col" style={{ gap: 14, alignItems: "flex-start", textAlign: "left" }}>
              <div style={{ fontSize: 28 }} className="text-2">Join at <b style={{ color: "var(--text)" }}>{window.location.host}/join</b></div>
              <div className="code-pill" style={{ fontSize: 88, padding: "12px 30px", letterSpacing: "0.14em" }}>{s.code}</div>
              <h2 style={{ fontSize: 34, marginTop: 12 }}>{s.title}</h2>
              <div className="row wrap" style={{ gap: 8, maxWidth: 520 }}>
                {state.participants.filter((p) => p.online).slice(0, 24).map((p) => (
                  <span key={p.id} className="badge fade-up" style={{ fontSize: 15, height: 32, padding: "0 14px" }}>{p.name}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

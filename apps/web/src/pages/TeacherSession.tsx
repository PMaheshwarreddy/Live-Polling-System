import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, BarChart3, Bot, Copy, MessageCircle, MonitorPlay, PenLine, Power, QrCode as QrIcon, Sparkles, Users, WifiOff } from "lucide-react";
import type { AiInsight, SessionInfo } from "@classpulse/shared";
import { useAiStatus } from "../components/ai";
import { ChatPanel, ParticipantsPanel, QrCode } from "../components/live";
import { AiQuizPanel, AssistantPanel, LivePollCard, PollComposer, ResultsHistory, emptyDraft, toPollInput, type Draft } from "../components/teacher";
import { Modal, Spinner, useToast } from "../components/ui";
import { api } from "../lib/api";
import { useTeacher } from "../lib/auth";
import { useLive } from "../lib/live";
import { TeacherTopbar } from "./TeacherHome";

export function TeacherSession() {
  const { id = "" } = useParams();
  const auth = useTeacher()!;
  const nav = useNavigate();
  const toast = useToast();
  const aiStatus = useAiStatus();
  const liveAuth = useMemo(() => ({ token: auth.token, sessionId: id }), [auth.token, id]);
  const { state, actions } = useLive(liveAuth);
  const [meta, setMeta] = useState<{ session: SessionInfo; documentIds: string[] } | null>(null);
  const [mode, setMode] = useState<"write" | "ai">("write");
  const [side, setSide] = useState<"people" | "chat" | "assistant">("people");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [invite, setInvite] = useState(false);
  const [seenChat, setSeenChat] = useState(0);

  useEffect(() => {
    api<{ session: SessionInfo; documentIds: string[] }>(`/api/sessions/${id}`, { token: auth.token })
      .then(setMeta)
      .catch(() => nav("/teacher", { replace: true }));
    api<{ insights: AiInsight[] }>(`/api/ai/sessions/${id}/insights`, { token: auth.token })
      .then((r) => actions.setInsights(r.insights))
      .catch(() => {});
  }, [id, auth.token]); // eslint-disable-line react-hooks/exhaustive-deps

  const session = state.snapshot?.session ?? meta?.session;
  const joinUrl = session ? `${window.location.origin}/join/${session.code}` : "";
  const online = state.participants.filter((p) => p.online).length;
  const aiOn = Boolean(aiStatus?.enabled);
  const unread = side === "chat" ? 0 : Math.max(0, state.chat.length - seenChat);
  const openSide = (next: typeof side) => {
    setSeenChat(state.chat.length);
    setSide(next);
  };

  const launch = async (d: Draft) => {
    const res = await actions.createPoll(toPollInput(d));
    if (!res.ok) {
      toast(res.error ?? "Couldn't start the question", "error");
      return false;
    }
    toast("Question is live!");
    setDraft(emptyDraft());
    return true;
  };

  if (!session)
    return (
      <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <Spinner size={28} />
      </div>
    );

  return (
    <>
      <TeacherTopbar>
        <span className="muted">/</span>
        <span className="bold" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 260 }}>
          {session.title}
        </span>
      </TeacherTopbar>

      <div className="container" style={{ padding: "20px 20px 0" }}>
        <div className="card row wrap" style={{ padding: "14px 18px", gap: 14 }}>
          <Link to="/teacher" className="btn btn-ghost btn-icon btn-sm" aria-label="Back to dashboard">
            <ArrowLeft size={18} />
          </Link>
          <div className="col" style={{ gap: 2 }}>
            <span className="tiny muted bold">JOIN CODE</span>
            <button
              className="code-pill"
              style={{ fontSize: 22 }}
              title="Copy join link"
              onClick={() => {
                void navigator.clipboard?.writeText(joinUrl);
                toast("Join link copied");
              }}
              data-testid="session-code"
            >
              {session.code}
            </button>
          </div>
          <div className="row small" style={{ gap: 16, marginLeft: 6 }}>
            <span className="row" style={{ gap: 6 }}>
              <span className={`dot ${online ? "dot-green" : ""}`} /> <b data-testid="online-count">{online}</b> online
            </span>
            <span className="row muted" style={{ gap: 6 }}>
              <BarChart3 size={15} /> {state.history.length} asked
            </span>
            {state.status === "reconnecting" && (
              <span className="badge badge-red">
                <WifiOff size={13} /> Reconnecting…
              </span>
            )}
            {state.status === "closed" && <span className="badge">Session ended</span>}
          </div>
          <div className="grow" />
          <button className="btn" onClick={() => setInvite(true)}>
            <QrIcon size={16} /> Invite
          </button>
          <a className="btn" href={`/teacher/session/${id}/present`} target="_blank" rel="noreferrer">
            <MonitorPlay size={16} /> Present
          </a>
          <Link className="btn" to={`/teacher/session/${id}/report`}>
            <BarChart3 size={16} /> Report
          </Link>
          {state.status !== "closed" && (
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!confirm("End this session? Students will be disconnected.")) return;
                await api(`/api/sessions/${id}/close`, { token: auth.token, method: "POST" });
                nav(`/teacher/session/${id}/report`);
              }}
            >
              <Power size={16} /> End
            </button>
          )}
        </div>
      </div>

      <main className="container console" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 20, padding: "20px 20px 48px", alignItems: "start" }}>
        <div className="col" style={{ gap: 20 }}>
          {state.activePoll ? (
            <LivePollCard
              poll={state.activePoll}
              progress={state.progress}
              onEnd={async () => {
                const r = await actions.endPoll(state.activePoll!.id);
                if (!r.ok) toast(r.error ?? "Couldn't end", "error");
              }}
            />
          ) : null}

          <div className="card">
            <div className="card-head" style={{ padding: "12px 16px" }}>
              <div className="tabs" role="tablist">
                <button role="tab" aria-selected={mode === "write"} className={`tab ${mode === "write" ? "active" : ""}`} onClick={() => setMode("write")}>
                  <PenLine size={15} /> Write a question
                </button>
                <button role="tab" aria-selected={mode === "ai"} className={`tab ${mode === "ai" ? "active" : ""}`} onClick={() => setMode("ai")} data-testid="tab-ai">
                  <Sparkles size={15} /> Generate with AI
                </button>
              </div>
            </div>
            <div className="card-body">
              <div hidden={mode !== "write"}>
                <PollComposer draft={draft} setDraft={setDraft} onLaunch={async () => void (await launch(draft))} disabled={Boolean(state.activePoll) || state.status !== "live"} />
              </div>
              <div hidden={mode !== "ai"}>
                {meta && (
                  <AiQuizPanel
                    token={auth.token}
                    sessionId={id}
                    onAi={actions.onAi}
                    attached={meta.documentIds}
                    setAttached={(ids) => setMeta({ ...meta, documentIds: ids })}
                    pollRunning={Boolean(state.activePoll)}
                    onEdit={(d) => {
                      setDraft(d);
                      setMode("write");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    onLaunch={launch}
                  />
                )}
              </div>
            </div>
          </div>

          <ResultsHistory
            history={state.history}
            insights={state.insights}
            aiOn={aiOn}
            onFollowUp={(d) => {
              setDraft(d);
              setMode("write");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </div>

        <aside className="card side" style={{ position: "sticky", top: 84, height: "calc(100vh - 110px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
            <div className="tabs" style={{ width: "100%" }} role="tablist">
              <button role="tab" className={`tab grow ${side === "people" ? "active" : ""}`} onClick={() => openSide("people")} style={{ justifyContent: "center" }}>
                <Users size={15} /> People <span className="count">{state.participants.length}</span>
              </button>
              <button role="tab" className={`tab grow ${side === "chat" ? "active" : ""}`} onClick={() => openSide("chat")} style={{ justifyContent: "center" }}>
                <MessageCircle size={15} /> Chat {unread > 0 && <span className="count">{unread}</span>}
              </button>
              {aiOn && (
                <button role="tab" className={`tab grow ${side === "assistant" ? "active" : ""}`} onClick={() => openSide("assistant")} style={{ justifyContent: "center" }}>
                  <Bot size={15} /> Assistant
                </button>
              )}
            </div>
          </div>
          <div className="grow" style={{ minHeight: 0, overflowY: side === "people" ? "auto" : "hidden" }}>
            {side === "people" && (
              <ParticipantsPanel
                participants={state.participants}
                onKick={async (p) => {
                  if (!confirm(`Remove ${p.name} from the session?`)) return;
                  const r = await actions.kick(p.id);
                  toast(r.ok ? `${p.name} was removed` : (r.error ?? "Couldn't remove"), r.ok ? "info" : "error");
                }}
              />
            )}
            {side === "chat" && <ChatPanel messages={state.chat} myId={auth.teacher.id} onSend={actions.sendChat} />}
            {side === "assistant" && <AssistantPanel token={auth.token} sessionId={id} onAi={actions.onAi} />}
          </div>
        </aside>
      </main>

      {invite && (
        <Modal label="Invite students" onClose={() => setInvite(false)}>
          <div className="col" style={{ alignItems: "center", padding: "10px 24px 28px", gap: 16, textAlign: "center" }}>
            <QrCode text={joinUrl} size={240} />
            <div>
              <div className="small muted">Scan, or go to</div>
              <div className="bold">{window.location.host}/join</div>
              <div className="small muted" style={{ marginTop: 6 }}>and enter</div>
              <div className="code-pill" style={{ fontSize: 34, display: "inline-block", marginTop: 6 }}>{session.code}</div>
            </div>
            <button
              className="btn"
              onClick={() => {
                void navigator.clipboard?.writeText(joinUrl);
                toast("Join link copied");
              }}
            >
              <Copy size={15} /> Copy link
            </button>
          </div>
        </Modal>
      )}
      <style>{`@media (max-width: 1000px){ .console{ grid-template-columns: 1fr !important; } .console .side{ position: static !important; height: 560px !important; } }`}</style>
    </>
  );
}

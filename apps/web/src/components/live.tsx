import { useEffect, useRef, useState } from "react";
import { Check, MessageCircle, Send, UserMinus, Users } from "lucide-react";
import QRCode from "qrcode";
import type { ChatMessage, Participant, PollResult } from "@classpulse/shared";
import { OPTION_COLORS, clock, letter } from "../lib/format";
import { Avatar, Empty } from "./ui";

export function CountdownRing({ seconds, total, size = 72, stroke = 7 }: { seconds: number; total: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? seconds / total : 0;
  const color = seconds <= 5 ? "var(--red)" : seconds <= 10 ? "var(--amber)" : "var(--brand)";
  return (
    <div className="ring" style={{ width: size, height: size }} role="timer" aria-label={`${seconds} seconds left`}>
      <svg width={size} height={size}>
        <circle className="track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} fill="none" />
        <circle
          className="bar"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          fill="none"
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
        />
      </svg>
      <span className="label" style={{ fontSize: size * 0.3, color: seconds <= 5 ? "var(--red)" : undefined }}>
        {seconds}
      </span>
    </div>
  );
}

/** Animated result bars. Bars grow from 0 on mount so every reveal feels live. */
export function ResultBars({ result, mine, big }: { result: PollResult; mine?: number | null; big?: boolean }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, [result.id]);
  return (
    <div className="col" style={{ gap: big ? 14 : 10 }}>
      {result.options.map((opt, i) => {
        const r = result.results[i];
        const correct = result.correctOptions.includes(i);
        return (
          <div
            key={i}
            className={`result ${correct ? "correct" : ""} ${mine === i ? "mine" : ""}`}
            style={{ ["--c" as string]: OPTION_COLORS[i], minHeight: big ? 70 : undefined }}
            data-testid={`result-${i}`}
          >
            {(r?.percentage ?? 0) > 0 && <div className="result-fill" style={{ width: shown ? `${r!.percentage}%` : "0%" }} />}
            <div className="result-inner" style={{ fontSize: big ? 22 : undefined }}>
              <span className="opt-letter" style={big ? { width: 42, height: 42, fontSize: 18 } : undefined}>
                {letter(i)}
              </span>
              <span className="grow" style={{ fontWeight: 600 }}>
                {opt}
                {mine === i && <span className="badge badge-brand" style={{ marginLeft: 8 }}>You</span>}
              </span>
              {correct && (
                <span className="badge badge-green">
                  <Check size={13} strokeWidth={3} /> Correct
                </span>
              )}
              <span className="pct" style={{ minWidth: 48, textAlign: "right" }}>
                {r?.percentage ?? 0}%
              </span>
              <span className="muted small" style={{ minWidth: 26, textAlign: "right" }}>
                {r?.count ?? 0}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ChatPanel({ messages, myId, onSend }: { messages: ChatMessage[]; myId: string; onSend: (t: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    const res = await onSend(t);
    if (!res.ok) {
      setErr(res.error ?? "Couldn't send");
      setText(t);
    } else setErr(null);
  };
  return (
    <div className="chat">
      <div className="chat-scroll" ref={scroller}>
        {messages.length === 0 && (
          <Empty icon={<MessageCircle size={22} />} title="No messages yet">
            Say hi to the class 👋
          </Empty>
        )}
        {messages.map((m) => {
          const me = m.senderId === myId;
          return (
            <div key={m.id} className={`msg ${me ? "me" : ""} ${m.senderRole}`}>
              {!me && (
                <span className="meta">
                  <b style={{ color: "var(--text-2)" }}>{m.senderName}</b>
                  {m.senderRole === "teacher" && " · Teacher"}
                </span>
              )}
              <div className="bubble">{m.text}</div>
              <span className="meta">{clock(m.createdAt)}</span>
            </div>
          );
        })}
      </div>
      {err && <div className="small" style={{ color: "var(--red)", padding: "0 14px" }}>{err}</div>}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input className="input" placeholder="Message the class…" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} aria-label="Chat message" />
        <button className="btn btn-primary btn-icon" aria-label="Send" disabled={!text.trim()}>
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}

export function ParticipantsPanel({ participants, onKick, answeredIds }: { participants: Participant[]; onKick?: (p: Participant) => void; answeredIds?: Set<string> }) {
  const sorted = [...participants].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  if (!participants.length)
    return (
      <Empty icon={<Users size={22} />} title="Nobody here yet">
        Share the join code to get students in.
      </Empty>
    );
  return (
    <div className="list" style={{ padding: 8 }}>
      {sorted.map((p) => (
        <div key={p.id} className="list-row" data-testid="participant">
          <Avatar name={p.name} online={p.online} />
          <div className="grow">
            <div className="bold" style={{ fontSize: 14 }}>{p.name}</div>
            <div className="tiny muted">{p.online ? "Online" : "Away"}</div>
          </div>
          {answeredIds?.has(p.id) && <span className="badge badge-green">Answered</span>}
          {onKick && (
            <button className="btn btn-ghost btn-sm btn-danger actions" onClick={() => onKick(p)} aria-label={`Remove ${p.name}`}>
              <UserMinus size={15} /> Remove
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function QrCode({ text, size = 220 }: { text: string; size?: number }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    void QRCode.toString(text, { type: "svg", margin: 1, color: { dark: "#17142b", light: "#ffffff" } }).then(setSvg);
  }, [text]);
  return (
    <div
      style={{ width: size, height: size, background: "white", borderRadius: 18, padding: 10, boxShadow: "var(--shadow)" }}
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-label="QR code to join"
    />
  );
}

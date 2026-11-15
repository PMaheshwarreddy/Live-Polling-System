import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Users } from "lucide-react";
import { Logo, Spinner, ThemeToggle } from "../components/ui";
import { api } from "../lib/api";
import { studentAuth, type StudentAuth } from "../lib/auth";

export function StudentJoin() {
  const params = useParams();
  const nav = useNavigate();
  const [code, setCode] = useState(params.code?.toUpperCase() ?? "");
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("cp.name") ?? "";
    } catch {
      return "";
    }
  });
  const [lookup, setLookup] = useState<{ code: string; session: { title: string; status: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const formatted = clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3, 6)}` : clean;
  const session = lookup?.code === formatted ? lookup.session : null;

  useEffect(() => {
    if (clean.length !== 6) return;
    // Already joined this session in this browser? Go straight back in.
    if (studentAuth.get(formatted)) return void nav(`/s/${formatted}`, { replace: true });
    api<{ session: { title: string; status: string } }>(`/api/sessions/code/${formatted}`)
      .then((r) => {
        setLookup({ code: formatted, session: r.session });
        setError(r.session.status !== "open" ? "This session has ended." : null);
      })
      .catch((e) => setError((e as Error).message));
  }, [formatted]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api<StudentAuth>(`/api/sessions/code/${formatted}/join`, { body: { name: name.trim() } });
      studentAuth.set(formatted, res);
      try {
        localStorage.setItem("cp.name", name.trim());
      } catch {
        /* ignore */
      }
      nav(`/s/${formatted}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, position: "relative" }}>
      <div className="grid-bg" aria-hidden />
      <div style={{ position: "absolute", top: 14, right: 16 }}>
        <ThemeToggle />
      </div>
      <form className="col fade-up" style={{ width: "min(440px, 100%)", gap: 22, position: "relative" }} onSubmit={join}>
        <Link to="/" style={{ alignSelf: "center" }}>
          <Logo size={40} />
        </Link>
        <div className="card col" style={{ padding: 28, gap: 18 }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 26 }}>Join your class</h1>
            <p className="muted small" style={{ marginTop: 4 }}>Enter the code on your teacher's screen.</p>
          </div>
          <input
            className="input input-xl"
            placeholder="ABC-123"
            value={formatted}
            maxLength={7}
            onChange={(e) => setCode(e.target.value)}
            aria-label="Session code"
            autoFocus={!params.code}
            data-testid="join-code"
          />
          {session && session.status === "open" && (
            <div className="ai-surface row fade-up" style={{ padding: 12 }}>
              <div className="logo-mark" style={{ width: 36, height: 36 }}>
                <Users size={18} />
              </div>
              <div>
                <div className="tiny muted">You're joining</div>
                <div className="bold" data-testid="join-title">{session.title}</div>
              </div>
            </div>
          )}
          <div className="field">
            <label htmlFor="name">Your name</label>
            <input
              id="name"
              className="input"
              style={{ height: 52, fontSize: 17 }}
              placeholder="What should we call you?"
              value={name}
              maxLength={40}
              required
              autoFocus={Boolean(params.code)}
              onChange={(e) => setName(e.target.value)}
              data-testid="join-name"
            />
          </div>
          {error && <div className="badge badge-red" style={{ height: "auto", padding: "8px 12px", whiteSpace: "normal" }}>{error}</div>}
          <button className="btn btn-primary btn-lg" disabled={busy || clean.length !== 6 || !name.trim() || session?.status !== "open"} data-testid="join-submit">
            {busy ? <Spinner /> : <>Let's go <ArrowRight size={18} /></>}
          </button>
        </div>
      </form>
    </div>
  );
}

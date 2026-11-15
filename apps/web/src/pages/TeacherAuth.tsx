import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Logo, Spinner, ThemeToggle } from "../components/ui";
import { api } from "../lib/api";
import { teacherAuth, useTeacher, type TeacherAuth as Auth } from "../lib/auth";

export function TeacherAuth({ mode }: { mode: "login" | "signup" }) {
  const nav = useNavigate();
  const teacher = useTeacher();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (teacher) return <Navigate to="/teacher" replace />;
  const signup = mode === "signup";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = signup ? form : { email: form.email, password: form.password };
      const res = await api<Auth>(`/api/auth/${mode}`, { body });
      teacherAuth.set(res);
      nav("/teacher");
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
      <div className="col fade-up" style={{ width: "min(420px, 100%)", gap: 22, position: "relative" }}>
        <Link to="/" style={{ alignSelf: "center" }}>
          <Logo size={40} />
        </Link>
        <form className="card card-pad col" style={{ gap: 16, padding: 28 }} onSubmit={submit}>
          <div>
            <h1 style={{ fontSize: 24 }}>{signup ? "Create your teacher account" : "Welcome back"}</h1>
            <p className="muted small" style={{ marginTop: 4 }}>
              {signup ? "Free and private. Takes ten seconds." : "Log in to run your live sessions."}
            </p>
          </div>
          {signup && (
            <div className="field">
              <label htmlFor="name">Your name</label>
              <input id="name" className="input" required maxLength={80} placeholder="Ms. Rao" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required autoComplete="email" placeholder="you@school.edu" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              required
              minLength={signup ? 8 : 1}
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder={signup ? "At least 8 characters" : "••••••••"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          {error && <div className="badge badge-red" style={{ height: "auto", padding: "8px 12px", whiteSpace: "normal" }}>{error}</div>}
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? <Spinner /> : <>{signup ? "Create account" : "Log in"} <ArrowRight size={18} /></>}
          </button>
        </form>
        <p className="small muted" style={{ textAlign: "center" }}>
          {signup ? "Already have an account? " : "New here? "}
          <Link to={signup ? "/teacher/login" : "/teacher/signup"} className="bold">
            {signup ? "Log in" : "Create an account"}
          </Link>
        </p>
      </div>
    </div>
  );
}

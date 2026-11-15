import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BarChart3, BookOpenCheck, Brain, Cpu, Lightbulb, MonitorPlay, Radio, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Logo, ThemeToggle } from "../components/ui";
import { useTeacher } from "../lib/auth";
import { OPTION_COLORS, letter } from "../lib/format";

const DEMO = {
  q: "Where does the Calvin cycle take place?",
  options: ["Stroma", "Thylakoid membrane", "Mitochondria", "Cytoplasm"],
  target: [64, 21, 9, 6],
};

/** A self-playing poll so visitors see the product working before they sign up. */
function DemoPoll() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setT((x) => (x + 1) % 14), 700);
    return () => clearInterval(i);
  }, []);
  const revealed = t >= 7;
  const answered = Math.min(28, Math.round((Math.min(t, 7) / 7) * 28));
  return (
    <div className="card" style={{ padding: 22, boxShadow: "var(--shadow-lg)", animation: "float 6s ease-in-out infinite" }}>
      <div className="row between" style={{ marginBottom: 14 }}>
        <span className="badge badge-brand">
          <span className="dot dot-green pulse-dot" style={{ color: "var(--green)" }} /> Live · Question 3
        </span>
        <span className="small muted">{revealed ? "Results" : `${answered}/28 answered`}</span>
      </div>
      <h3 style={{ fontSize: 19, marginBottom: 16 }}>{DEMO.q}</h3>
      <div className="col" style={{ gap: 9 }}>
        {DEMO.options.map((o, i) => (
          <div key={o} className={`result ${revealed && i === 0 ? "correct" : ""}`} style={{ ["--c" as string]: OPTION_COLORS[i] }}>
            <div className="result-fill" style={{ width: revealed ? `${DEMO.target[i]}%` : "0%" }} />
            <div className="result-inner">
              <span className="opt-letter">{letter(i)}</span>
              <span className="grow" style={{ fontWeight: 600 }}>{o}</span>
              {revealed && <span className="pct">{DEMO.target[i]}%</span>}
            </div>
          </div>
        ))}
      </div>
      <div className="ai-surface" style={{ marginTop: 16, opacity: revealed ? 1 : 0.35, transition: "opacity .4s" }}>
        <div className="ai-chip" style={{ marginBottom: 4 }}>
          <Sparkles size={14} /> Insight · qwen2.5 running locally
        </div>
        <div className="small text-2">
          21% picked the thylakoid. They may be mixing up the light reactions with the Calvin cycle. One-click follow-up ready.
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Radio, title: "Real-time polls", text: "Students join with a code or QR. Results update live, timers survive server restarts, and refreshed tabs resume." },
  { icon: Brain, title: "Quizzes from your notes", text: "Upload a PDF or notes. A local model writes multiple-choice questions grounded in your material, with citations." },
  { icon: BookOpenCheck, title: "A tutor that cites sources", text: "Students ask questions and get short answers that quote your documents. It pauses itself during live questions." },
  { icon: Lightbulb, title: "Misconception insights", text: "After every poll, AI explains the most popular wrong answer and drafts a follow-up question to launch in one click." },
  { icon: MonitorPlay, title: "Projector mode", text: "A clean full-screen view with a big join code, countdown and animated results for the classroom screen." },
  { icon: BarChart3, title: "Analytics & export", text: "Accuracy per question, scores per student, and a CSV export for your gradebook." },
];

export function Landing() {
  const nav = useNavigate();
  const teacher = useTeacher();
  const [code, setCode] = useState("");
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const formatted = clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3, 6)}` : clean;

  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div className="grid-bg" aria-hidden />
      <header className="container topbar-inner" style={{ position: "relative" }}>
        <Logo />
        <div className="grow" />
        <ThemeToggle />
        <Link className="btn btn-ghost" to={teacher ? "/teacher" : "/teacher/login"}>
          {teacher ? "Dashboard" : "Teacher login"}
        </Link>
      </header>

      <main className="container" style={{ position: "relative" }}>
        <section
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 56, alignItems: "center", padding: "56px 0 72px" }}
        >
          <div className="col fade-up" style={{ gap: 22 }}>
            <span className="badge badge-brand" style={{ alignSelf: "flex-start", height: 30, padding: "0 12px" }}>
              <Cpu size={14} /> AI runs on your own computer. No API keys, no cost.
            </span>
            <h1 style={{ fontSize: "clamp(40px, 6vw, 64px)", fontWeight: 800, letterSpacing: "-0.045em", lineHeight: 1.02 }}>
              Feel the <span className="gradient-text">pulse</span> of your classroom.
            </h1>
            <p className="text-2" style={{ fontSize: 18, maxWidth: 520 }}>
              Live polls students answer from any phone, plus a private AI teaching assistant that builds quizzes from your own
              notes and shows you exactly where the class is stuck.
            </p>

            <form
              className="card"
              style={{ padding: 10, display: "flex", gap: 10, maxWidth: 480 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (clean.length === 6) nav(`/join/${formatted}`);
              }}
            >
              <input
                className="input input-xl"
                style={{ height: 56, fontSize: 22, border: 0, background: "transparent" }}
                placeholder="ABC-123"
                value={formatted}
                onChange={(e) => setCode(e.target.value)}
                aria-label="Session code"
                maxLength={7}
                data-testid="landing-code"
              />
              <button className="btn btn-primary btn-lg" disabled={clean.length !== 6}>
                Join <ArrowRight size={18} />
              </button>
            </form>
            <div className="row wrap small muted" style={{ gap: 18 }}>
              <span className="row" style={{ gap: 6 }}>
                <Zap size={15} /> Join in 5 seconds, no account
              </span>
              <span className="row" style={{ gap: 6 }}>
                <ShieldCheck size={15} /> Student data never leaves your server
              </span>
            </div>
            <div className="row">
              <Link to={teacher ? "/teacher" : "/teacher/signup"} className="btn btn-dark btn-lg">
                I'm a teacher <ArrowRight size={18} />
              </Link>
            </div>
          </div>
          <div className="fade-up" style={{ animationDelay: ".1s" }}>
            <DemoPoll />
          </div>
        </section>

        <section style={{ paddingBottom: 72 }}>
          <div className="section-title" style={{ marginBottom: 10 }}>Everything in one place</div>
          <h2 style={{ fontSize: 32, marginBottom: 28, maxWidth: 640 }}>Built for the 45 minutes you actually have with your class.</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
            {FEATURES.map(({ icon: Icon, title, text }, i) => (
              <div key={title} className="card card-pad fade-up" style={{ animationDelay: `${i * 0.05}s` }}>
                <div className="logo-mark" style={{ width: 42, height: 42, borderRadius: 13, marginBottom: 14 }}>
                  <Icon size={21} />
                </div>
                <h3 style={{ fontSize: 17, marginBottom: 6 }}>{title}</h3>
                <p className="text-2 small" style={{ fontSize: 14 }}>{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <footer className="container row between small muted" style={{ padding: "24px 20px 40px", borderTop: "1px solid var(--border)" }}>
        <span>ClassPulse: open source, MIT licensed</span>
        <span>Powered by Ollama · qwen2.5 · pgvector</span>
      </footer>
    </div>
  );
}

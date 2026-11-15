import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Activity, AlertCircle, CheckCircle2, Moon, Sun, X } from "lucide-react";
import { avatarColor, initials } from "../lib/format";

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="logo">
      <span className="logo-mark" style={{ width: size, height: size }}>
        <Activity size={size * 0.55} strokeWidth={2.6} />
      </span>
      ClassPulse
    </span>
  );
}

export function Avatar({ name, online, small }: { name: string; online?: boolean; small?: boolean }) {
  return (
    <span className={`avatar ${small ? "avatar-sm" : ""}`} style={{ background: avatarColor(name) }} aria-hidden>
      {initials(name)}
      {online !== undefined && <span className={`presence ${online ? "on" : ""}`} />}
    </span>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-label="Loading" />;
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="icon">{icon}</div>
      <div className="bold text-2">{title}</div>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function Modal({ onClose, children, wide, label }: { onClose: () => void; children: ReactNode; wide?: boolean; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal aria-label={label}>
        <div className="row between" style={{ padding: "16px 18px 0 22px" }}>
          <h3 style={{ fontSize: 17 }}>{label}</h3>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- theme ---------- */
type Theme = "light" | "dark" | "system";
function applyTheme(t: Theme) {
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
}
export function initTheme() {
  try {
    applyTheme((localStorage.getItem("cp.theme") as Theme) ?? "system");
  } catch {
    /* ignore */
  }
}
export function ThemeToggle() {
  const [dark, setDark] = useState(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    return attr ? attr === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  return (
    <button
      className="btn btn-ghost btn-icon"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const next: Theme = dark ? "light" : "dark";
        applyTheme(next);
        try {
          localStorage.setItem("cp.theme", next);
        } catch {
          /* ignore */
        }
        setDark(!dark);
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

/* ---------- toasts ---------- */
interface Toast {
  id: number;
  text: string;
  kind: "info" | "error";
}
const ToastCtx = createContext<(text: string, kind?: "info" | "error") => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: "info" | "error" = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 5000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "error" ? "error" : ""}`}>
            {t.kind === "error" ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Cpu, Sparkles } from "lucide-react";
import type { AiStatus, Citation, ConceptGraph } from "@classpulse/shared";
import { api } from "../lib/api";

export function useAiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<AiStatus>("/api/ai/status")
        .then((s) => alive && setStatus(s))
        .catch(() => alive && setStatus(null));
    load();
    const t = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return status;
}

export function AiStatusPill({ status }: { status: AiStatus | null }) {
  if (!status) return null;
  const ok = status.enabled && status.online && !status.missing.length;
  const label = !status.enabled ? "AI off" : !status.online ? "Ollama offline" : status.missing.length ? "Model missing" : "Local AI ready";
  const title = !status.enabled
    ? "AI features are turned off on the server"
    : !status.online
      ? "Start Ollama to use AI features"
      : status.missing.length
        ? `Run: ollama pull ${status.missing.join(" && ollama pull ")}`
        : `Running on this machine: ${status.models.smart}, ${status.models.fast}, ${status.models.embed}`;
  return (
    <span className={`badge ${ok ? "badge-green" : "badge-red"}`} title={title} data-testid="ai-status">
      <Cpu size={13} /> {label}
    </span>
  );
}

export function AiLabel({ children = "AI" }: { children?: React.ReactNode }) {
  return (
    <span className="ai-chip">
      <Sparkles size={14} /> {children}
    </span>
  );
}

export function Citations({ items }: { items: Citation[] }) {
  if (!items.length) return null;
  return (
    <div className="chips" style={{ marginTop: 10 }}>
      {items.map((c, i) => (
        <span key={c.chunkId + i} className="citation" title={c.excerpt}>
          <BookOpen size={12} /> [{i + 1}] {c.documentTitle}
        </span>
      ))}
    </div>
  );
}

/** Tiny force-directed layout for the GraphRAG concept graph (no chart library needed). */
export function ConceptMap({ graph }: { graph: ConceptGraph }) {
  const W = 820;
  const H = 520;
  const [hover, setHover] = useState<string | null>(null);
  const layout = useMemo(() => {
    const n = graph.nodes.length;
    const pos = graph.nodes.map((_, i) => {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      return { x: W / 2 + Math.cos(a) * 180, y: H / 2 + Math.sin(a) * 160, vx: 0, vy: 0 };
    });
    const idx = new Map(graph.nodes.map((nd, i) => [nd.id, i]));
    const edges = graph.edges.map((e) => [idx.get(e.source), idx.get(e.target)]).filter((e): e is [number, number] => e[0] !== undefined && e[1] !== undefined);
    const degree = graph.nodes.map((_, i) => edges.filter(([a, b]) => a === i || b === i).length);
    for (let it = 0; it < 300; it++) {
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const a = pos[i]!, b = pos[j]!;
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = Math.max(dx * dx + dy * dy, 100);
          const f = 2200 / d2;
          const d = Math.sqrt(d2);
          a.vx += (dx / d) * f; a.vy += (dy / d) * f;
          b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
        }
      for (const [i, j] of edges) {
        const a = pos[i]!, b = pos[j]!;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - 110) * 0.012;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
      for (const p of pos) {
        p.vx += (W / 2 - p.x) * 0.004;
        p.vy += (H / 2 - p.y) * 0.004;
        p.x = Math.min(W - 70, Math.max(70, p.x + p.vx * 0.5));
        p.y = Math.min(H - 30, Math.max(30, p.y + p.vy * 0.5));
        p.vx *= 0.6;
        p.vy *= 0.6;
      }
    }
    return { pos, edges, degree };
  }, [graph]);

  const hi = hover ? graph.nodes.findIndex((n) => n.id === hover) : -1;
  const linked = new Set(layout.edges.filter(([a, b]) => a === hi || b === hi).flat());
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Concept map">
        <defs>
          <linearGradient id="cm-g" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#6d4aff" />
            <stop offset="1" stopColor="#ff4d8d" />
          </linearGradient>
        </defs>
        {layout.edges.map(([a, b], i) => {
          const on = hi >= 0 && (a === hi || b === hi);
          return (
            <line
              key={i}
              x1={layout.pos[a]!.x}
              y1={layout.pos[a]!.y}
              x2={layout.pos[b]!.x}
              y2={layout.pos[b]!.y}
              stroke={on ? "var(--brand)" : "var(--border-strong)"}
              strokeWidth={on ? 2 : 1}
              opacity={hi >= 0 && !on ? 0.25 : 0.9}
            />
          );
        })}
        {graph.nodes.map((n, i) => {
          const p = layout.pos[i]!;
          const r = 6 + Math.min(10, layout.degree[i]! * 1.2);
          const dim = hi >= 0 && i !== hi && !linked.has(i);
          return (
            <g key={n.id} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }} opacity={dim ? 0.3 : 1}>
              <circle cx={p.x} cy={p.y} r={r} fill="url(#cm-g)" stroke="var(--bg-elev)" strokeWidth={2} />
              <text x={p.x} y={p.y - r - 6} textAnchor="middle" fontSize={12} fontWeight={i === hi ? 800 : 600} fill="var(--text)">
                {n.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="small muted" style={{ minHeight: 40, padding: "0 4px" }}>
        {hi >= 0 ? (
          <>
            <b className="text-2">{graph.nodes[hi]!.name}</b>: {graph.nodes[hi]!.description}
          </>
        ) : (
          "Hover a concept to see where it appears. Linked concepts are discussed together in the material; GraphRAG walks these links to find related passages."
        )}
      </div>
    </div>
  );
}

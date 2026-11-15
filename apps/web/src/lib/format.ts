export const OPTION_COLORS = ["var(--opt-a)", "var(--opt-b)", "var(--opt-c)", "var(--opt-d)", "var(--opt-e)", "var(--opt-f)"];
export const letter = (i: number) => String.fromCharCode(65 + i);

const AVATAR_COLORS = ["#6d4aff", "#ff4d8d", "#12b76a", "#f79009", "#2e90fa", "#e04fd8", "#0ba5ec", "#7a5af8", "#ef6820"];
export function avatarColor(seed: string) {
  // FNV-1a: spreads short, similar names ("Ben", "Dara") across the palette.
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length]!;
}
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

export function timeAgo(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

export function accuracy(r: { results: { optionIndex: number; count: number }[]; correctOptions: number[]; totalResponses: number }) {
  if (!r.totalResponses) return null;
  const c = r.results.filter((x) => r.correctOptions.includes(x.optionIndex)).reduce((n, x) => n + x.count, 0);
  return Math.round((c / r.totalResponses) * 100);
}

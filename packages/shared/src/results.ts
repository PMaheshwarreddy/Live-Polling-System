import type { OptionResult } from "./types.js";

/** Count answers per option and turn them into whole-number percentages that sum to 100. */
export function tallyResults(optionCount: number, answers: number[]): OptionResult[] {
  const counts = Array.from({ length: optionCount }, () => 0);
  for (const a of answers) if (a >= 0 && a < optionCount) counts[a] = (counts[a] ?? 0) + 1;
  const total = counts.reduce((s, c) => s + c, 0);
  if (total === 0) return counts.map((count, optionIndex) => ({ optionIndex, count, percentage: 0 }));

  // Largest-remainder rounding so the bars always add up to exactly 100%.
  const raw = counts.map((c) => (c / total) * 100);
  const floored = raw.map(Math.floor);
  let remaining = 100 - floored.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remaining <= 0) break;
    floored[i] = (floored[i] ?? 0) + 1;
    remaining--;
  }
  return counts.map((count, optionIndex) => ({ optionIndex, count, percentage: floored[optionIndex] ?? 0 }));
}

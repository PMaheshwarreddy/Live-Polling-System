import type { AiStatus } from "@classpulse/shared";
import { config } from "../config.js";

let cache: { at: number; value: AiStatus } | null = null;

/** Asks the local Ollama server which models it has. Cached for 15s so the UI can poll freely. */
export async function aiStatus(): Promise<AiStatus> {
  if (cache && Date.now() - cache.at < 15_000) return cache.value;
  const models = { smart: config.AI_MODEL_SMART, fast: config.AI_MODEL_FAST, embed: config.AI_MODEL_EMBED };
  let value: AiStatus;
  if (!config.aiEnabled) {
    value = { enabled: false, online: false, models, missing: [] };
  } else {
    try {
      const res = await fetch(`${config.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
      const body = (await res.json()) as { models?: { name: string }[] };
      const have = new Set((body.models ?? []).flatMap((m) => [m.name, m.name.replace(/:latest$/, "")]));
      value = { enabled: true, online: true, models, missing: Object.values(models).filter((m) => !have.has(m)) };
    } catch {
      value = { enabled: true, online: false, models, missing: [] };
    }
  }
  cache = { at: Date.now(), value };
  return value;
}

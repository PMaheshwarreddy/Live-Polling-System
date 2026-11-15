/**
 * Minimal client for a local Ollama server. No API keys, no per-token bills: every model runs on
 * the machine. Each call is reported through `onCall` so the app can show usage and latency.
 */
export interface LlmCall {
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  ok: boolean;
  error?: string;
}

export interface ChatOptions {
  model: string;
  feature: string;
  system?: string;
  prompt: string;
  /** JSON schema: Ollama constrains the output to it (structured outputs). */
  schema?: object;
  temperature?: number;
  maxTokens?: number;
  /** Receives text as it is generated. */
  onToken?: (delta: string) => void;
}

export class LlmError extends Error {}

export class Ollama {
  constructor(
    private readonly url: string,
    private readonly onCall: (call: LlmCall) => void = () => {},
    private readonly opts: { keepAlive?: string; numThread?: number; timeoutMs?: number } = {},
  ) {}

  private get keepAlive() {
    return this.opts.keepAlive ?? "30m";
  }
  /** Ollama often picks too few threads on hybrid (P/E-core) laptop CPUs. 0 = let Ollama decide. */
  private get threadOpt() {
    return this.opts.numThread ? { num_thread: this.opts.numThread } : {};
  }

  async chat(opts: ChatOptions): Promise<string> {
    const started = Date.now();
    const messages = [
      ...(opts.system ? [{ role: "system", content: opts.system }] : []),
      { role: "user", content: opts.prompt },
    ];
    const stream = Boolean(opts.onToken);
    let inputTokens = 0;
    let outputTokens = 0;
    try {
      const res = await fetch(`${this.url}/api/chat`, {
        method: "POST",
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 240_000),
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          messages,
          stream,
          keep_alive: this.keepAlive,
          ...(opts.schema ? { format: opts.schema } : {}),
          options: { temperature: opts.temperature ?? 0.3, num_predict: opts.maxTokens ?? 400, num_ctx: 4096, ...this.threadOpt },
        }),
      });
      if (!res.ok || !res.body) throw new LlmError(`Ollama returned ${res.status}: ${await res.text().catch(() => "")}`);

      let text = "";
      if (!stream) {
        const body = (await res.json()) as OllamaChunk;
        text = body.message?.content ?? "";
        inputTokens = body.prompt_eval_count ?? 0;
        outputTokens = body.eval_count ?? 0;
      } else {
        const decoder = new TextDecoder();
        let buf = "";
        for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
          buf += decoder.decode(part, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const chunk = JSON.parse(line) as OllamaChunk;
            if (chunk.error) throw new LlmError(chunk.error);
            const delta = chunk.message?.content ?? "";
            if (delta) {
              text += delta;
              opts.onToken!(delta);
            }
            if (chunk.done) {
              inputTokens = chunk.prompt_eval_count ?? 0;
              outputTokens = chunk.eval_count ?? 0;
            }
          }
        }
      }
      this.onCall({ feature: opts.feature, model: opts.model, inputTokens, outputTokens, latencyMs: Date.now() - started, ok: true });
      return text.trim();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onCall({ feature: opts.feature, model: opts.model, inputTokens, outputTokens, latencyMs: Date.now() - started, ok: false, error: message });
      if (err instanceof LlmError) throw err;
      throw new LlmError(`Could not reach the local model server at ${this.url} (${message}). Is Ollama running?`);
    }
  }

  /** Structured output: constrained by `schema`, then parsed. Retries once on malformed JSON. */
  async chatJson<T>(opts: ChatOptions & { schema: object }, validate: (v: unknown) => T): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.chat({ ...opts, temperature: attempt === 0 ? opts.temperature : 0.1 });
      try {
        return validate(JSON.parse(raw));
      } catch (err) {
        lastErr = err;
      }
    }
    throw new LlmError(`Model returned invalid JSON: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
  }

  async embed(model: string, texts: string[], feature = "embed"): Promise<number[][]> {
    if (!texts.length) return [];
    const started = Date.now();
    const out: number[][] = [];
    try {
      for (let i = 0; i < texts.length; i += 32) {
        const res = await fetch(`${this.url}/api/embed`, {
          method: "POST",
          signal: AbortSignal.timeout(60_000),
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model, input: texts.slice(i, i + 32), keep_alive: this.keepAlive }),
        });
        if (!res.ok) throw new LlmError(`Ollama embed returned ${res.status}: ${await res.text().catch(() => "")}`);
        const body = (await res.json()) as { embeddings: number[][] };
        out.push(...body.embeddings);
      }
      this.onCall({ feature, model, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started, ok: true });
      return out;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onCall({ feature, model, inputTokens: 0, outputTokens: 0, latencyMs: Date.now() - started, ok: false, error: message });
      if (err instanceof LlmError) throw err;
      throw new LlmError(`Could not reach the local model server at ${this.url} (${message}). Is Ollama running?`);
    }
  }
}

interface OllamaChunk {
  message?: { content?: string };
  done?: boolean;
  error?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export interface Models {
  smart: string;
  fast: string;
  embed: string;
}

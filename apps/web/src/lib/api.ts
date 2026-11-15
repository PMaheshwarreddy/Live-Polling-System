export const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? "http://localhost:5000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** JSON fetch against the ClassPulse server. Throws ApiError with the server's message. */
export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null; form?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${SERVER_URL}${path}`, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError(0, "Can't reach the ClassPulse server. Is it running?");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function downloadFile(path: string, token: string, filename: string) {
  const res = await fetch(`${SERVER_URL}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new ApiError(res.status, "Download failed");
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

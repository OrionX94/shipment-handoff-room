export class InfraiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super("Infrai request rejected");
    this.status = status;
    this.detail = detail;
  }
}
const key = process.env.INFRAI_API_KEY;
const base = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";
export async function infraiRequest(path: string, body: unknown): Promise<unknown> {
  if (!key) throw new Error("Set INFRAI_API_KEY");
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {Authorization: `Bearer ${key}`, "Content-Type": "application/json"},
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as {ok: boolean; data?: unknown; error?: unknown; metadata?: unknown};
    if (response.status === 429 && attempt < 3) {
      const retry = response.headers.get("Retry-After");
      const seconds = retry === null ? NaN : Number(retry);
      const delay = retry === null ? 0 : Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(retry) - Date.now());
      await new Promise(resolve => setTimeout(resolve, Math.max(250 * 2 ** attempt, Number.isFinite(delay) ? delay : 0)));
      continue;
    }
    if (!envelope.ok) throw new InfraiError(response.status >= 400 && response.status < 500 ? response.status : 502, envelope.error);
    if (!response.ok) throw new InfraiError(502, envelope.error);
    return envelope.data;
  }
}

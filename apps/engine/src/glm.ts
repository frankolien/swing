import { ZAI_API_KEY, ZAI_BASE_URL, ZAI_MODEL } from "./config.js";

/// True when a Z.ai key is configured — otherwise callers fall back to deterministic templates.
export const glmEnabled = (): boolean => ZAI_API_KEY.length > 0;

/// One-shot GLM chat completion against Z.ai's OpenAI-compatible endpoint. Short timeout so a slow
/// or unreachable provider never stalls a request — the caller is expected to fall back on throw.
export async function glmComplete(
  system: string,
  user: string,
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  if (!glmEnabled()) throw new Error("GLM disabled (no ZAI_API_KEY)");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${ZAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${ZAI_API_KEY}` },
      body: JSON.stringify({
        model: ZAI_MODEL,
        temperature: opts.temperature ?? 0.4,
        max_tokens: opts.maxTokens ?? 256,
        // GLM-4.5/4.6 are reasoning models; the thinking phase can take 20s+ and would blow the
        // timeout. Short decision narration doesn't need it — disable for a ~3s response.
        thinking: { type: "disabled" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`GLM ${res.status}: ${await res.text().catch(() => "")}`);
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("GLM returned no content");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

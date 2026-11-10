import type { CallLlm } from "@encaixe/core";

export type Provider = "anthropic" | "openai-compatible";
export const presets = {
  openai: "https://api.openai.com/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
} as const;

export function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    return ["localhost", "127.0.0.1"].includes(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

export function isValidBaseUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.protocol === "https:" || (url.protocol === "http:" && isLocalBaseUrl(baseUrl));
  } catch {
    return false;
  }
}

export interface LlmSettings {
  provider: Provider;
  baseUrl: string;
  model: string;
  apiKey: string;
  remember: boolean;
}
export type LlmErrorCode = "auth" | "rate_limit" | "refused" | "truncated" | "network" | "api";
export class LlmError extends Error {
  constructor(
    public code: LlmErrorCode,
    public status?: number,
  ) {
    super(code);
    this.name = "LlmError";
  }
}
const key = "encaixe.llm";
export function loadLlmSettings(): LlmSettings | undefined {
  for (const persistent of [false, true]) {
    try {
      const storage = persistent ? localStorage : sessionStorage;
      const value = JSON.parse(storage.getItem(key) ?? "null");
      if (value?.provider === "openai") {
        value.provider = "openai-compatible";
        value.baseUrl ??= presets.openai;
      }
      if (value?.provider === "anthropic" && typeof value.baseUrl !== "string") {
        value.baseUrl = presets.openai;
      }
      if (
        value &&
        (value.provider === "anthropic" || value.provider === "openai-compatible") &&
        typeof value.baseUrl === "string" &&
        (value.provider === "anthropic" || isValidBaseUrl(value.baseUrl)) &&
        typeof value.model === "string" &&
        value.model.trim() &&
        typeof value.apiKey === "string" &&
        (value.apiKey.trim() || (value.provider === "openai-compatible" && isLocalBaseUrl(value.baseUrl))) &&
        typeof value.remember === "boolean"
      )
        return {
          provider: value.provider,
          baseUrl: value.baseUrl,
          model: value.model,
          apiKey: value.apiKey,
          remember: persistent,
        };
    } catch {
      /* Storage may be unavailable. */
    }
  }
}
export function clearLlmSettings(): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable. */
  }
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* Storage may be unavailable. */
  }
}
export function saveLlmSettings(s: LlmSettings): void {
  if (s.provider === "openai-compatible" && !isValidBaseUrl(s.baseUrl)) return;
  if (!s.model.trim() || (!s.apiKey.trim() && (s.provider === "anthropic" || !isLocalBaseUrl(s.baseUrl))))
    return;
  clearLlmSettings();
  try {
    (s.remember ? localStorage : sessionStorage).setItem(key, JSON.stringify(s));
  } catch {
    /* The current configuration still works in memory. */
  }
}
export function createCallLlm(s: LlmSettings): CallLlm {
  return async (messages) => {
    if (s.provider === "anthropic") {
      // SDK carregado só quando usado: quem usa uma API compatível nunca baixa.
      let Anthropic: typeof import("@anthropic-ai/sdk").default;
      try {
        ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
      } catch {
        throw new LlmError("network");
      }
      try {
        const client = new Anthropic({ apiKey: s.apiKey, dangerouslyAllowBrowser: true });
        const withFallback = s.model === "claude-opus-5-5" || s.model === "claude-sonnet-5-5";
        const res = await client.beta.messages.create({
          model: s.model,
          max_tokens: 16000,
          system: messages.system,
          messages: [{ role: "user", content: messages.user }],
          ...(withFallback
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        });
        if (res.stop_reason === "refusal") throw new LlmError("refused");
        if (res.stop_reason === "max_tokens") throw new LlmError("truncated");
        return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      } catch (error) {
        if (error instanceof LlmError) throw error;
        if (error instanceof Anthropic.AuthenticationError) throw new LlmError("auth", error.status);
        if (error instanceof Anthropic.RateLimitError) throw new LlmError("rate_limit", error.status);
        if (error instanceof Anthropic.APIConnectionError) throw new LlmError("network");
        if (error instanceof Anthropic.APIError) throw new LlmError("api", error.status);
        throw new LlmError("api");
      }
    }
    let res: Response;
    try {
      const url = `${s.baseUrl.trim().replace(/\/+$/, "")}/chat/completions`;
      const body = {
        model: s.model,
        messages: [
          { role: "system", content: messages.system },
          { role: "user", content: messages.user },
        ],
      };
      const request = (jsonFormat: boolean) =>
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(s.apiKey.trim() ? { Authorization: `Bearer ${s.apiKey.trim()}` } : {}),
          },
          body: JSON.stringify({
            ...body,
            ...(jsonFormat ? { response_format: { type: "json_object" } } : {}),
          }),
        });
      res = await request(true);
      if (res.status === 400 && (await res.clone().text()).includes("response_format")) {
        // ponytail: alguns modelos não aceitam response_format; tentar só uma vez sem ele.
        res = await request(false);
      }
    } catch {
      throw new LlmError("network");
    }
    if (!res.ok)
      throw new LlmError(res.status === 401 ? "auth" : res.status === 429 ? "rate_limit" : "api", res.status);
    try {
      const data = await res.json();
      const choice = data.choices?.[0];
      if (choice?.finish_reason === "length") throw new LlmError("truncated");
      if (choice?.message?.refusal) throw new LlmError("refused");
      if (typeof choice?.message?.content !== "string") throw new LlmError("api");
      return choice.message.content;
    } catch (error) {
      throw error instanceof LlmError ? error : new LlmError("api");
    }
  };
}

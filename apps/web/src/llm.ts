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
  fallbackModels: string[];
  apiKey: string;
  remember: boolean;
}
export type LlmErrorCode =
  | "auth"
  | "model"
  | "overloaded"
  | "rate_limit"
  | "refused"
  | "truncated"
  | "network"
  | "api"
  | "timeout"
  | "canceled";
export class LlmError extends Error {
  constructor(
    public code: LlmErrorCode,
    public status?: number,
    /** Mensagem do provedor, para a pessoa entender o erro (ex.: "Please pass a valid API key"). */
    public detail?: string,
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
          fallbackModels: Array.isArray(value.fallbackModels)
            ? value.fallbackModels.filter(
                (id: unknown): id is string => typeof id === "string" && !!id.trim(),
              )
            : [],
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
function apiError(status: number | undefined, detail = ""): LlmError {
  const code: LlmErrorCode =
    status === 401 || status === 403 || /api.?key|unauthori[sz]ed|permission/i.test(detail)
      ? "auth"
      : status === 429
        ? "rate_limit"
        : status === 503 || status === 529
          ? "overloaded"
          : status === 404 ||
              (/model/i.test(detail) &&
                /not found|does not exist|not supported|no longer available/i.test(detail))
            ? "model"
            : /high demand|overloaded|unavailable/i.test(detail)
              ? "overloaded"
              : "api";
  return new LlmError(code, status, detail.slice(0, 300) || undefined);
}

async function responseError(res: Response): Promise<LlmError> {
  let detail = "";
  try {
    const body = await res.json();
    detail = String((Array.isArray(body) ? body[0] : body)?.error?.message ?? "");
  } catch {
    /* The status still identifies errors without a readable body. */
  }
  return apiError(res.status, detail);
}

export async function listModels(
  settings: Pick<LlmSettings, "provider" | "baseUrl" | "apiKey">,
  signal?: AbortSignal,
): Promise<string[]> {
  let ids: unknown[];
  if (settings.provider === "anthropic") {
    let Anthropic: typeof import("@anthropic-ai/sdk").default;
    try {
      ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
    } catch (error) {
      throw new LlmError(
        "network",
        undefined,
        error instanceof Error ? error.message.slice(0, 300) : undefined,
      );
    }
    try {
      const client = new Anthropic({
        apiKey: settings.apiKey.trim(),
        dangerouslyAllowBrowser: true,
        maxRetries: 0,
      });
      ids = [];
      for await (const model of client.models.list({}, { signal })) ids.push(model.id);
    } catch (error) {
      if (error instanceof Anthropic.APIConnectionError)
        throw new LlmError("network", undefined, error.message.slice(0, 300));
      const mapped =
        error instanceof Anthropic.APIError ? apiError(error.status, error.message) : new LlmError("api");
      throw new LlmError(mapped.code === "auth" ? "auth" : "api", mapped.status, mapped.detail);
    }
  } else {
    let res: Response;
    try {
      res = await fetch(`${settings.baseUrl.trim().replace(/\/+$/, "")}/models`, {
        signal,
        headers: settings.apiKey.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {},
      });
    } catch (error) {
      throw new LlmError(
        "network",
        undefined,
        error instanceof Error ? error.message.slice(0, 300) : undefined,
      );
    }
    if (!res.ok) {
      const error = await responseError(res);
      throw new LlmError(error.code === "auth" ? "auth" : "api", error.status, error.detail);
    }
    try {
      const body = await res.json();
      if (!Array.isArray(body.data)) throw new Error("Invalid models response");
      ids = body.data.map((model: { id?: unknown } | null) => model?.id);
    } catch (error) {
      throw new LlmError("api", res.status, error instanceof Error ? error.message.slice(0, 300) : undefined);
    }
  }
  return [
    ...new Set(
      ids
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.replace(/^models\//, ""))
        .filter(
          (id) =>
            id &&
            !/embed|tts|whisper|dall-e|imagen|image|audio|speech|moderation|realtime|transcribe|aqa|veo|lyria/i.test(
              id,
            ),
        ),
    ),
  ];
}

export function rankModels(ids: string[], provider: Provider, baseUrl: string): string[] {
  const gemini = baseUrl.includes("generativelanguage");
  const group = (id: string) => {
    if (gemini) return /flash/i.test(id) ? (/lite/i.test(id) ? 1 : 0) : 2;
    if (provider === "anthropic") {
      const index = ["opus", "sonnet", "haiku"].findIndex((name) => id.toLowerCase().includes(name));
      return index < 0 ? 3 : index;
    }
    return 0;
  };
  return [...ids].sort((a, b) => {
    const preference = group(a) - group(b);
    if (preference) return preference;
    if (gemini) {
      const preview = Number(/preview|exp/i.test(a)) - Number(/preview|exp/i.test(b));
      if (preview) return preview;
    }
    const av = (a.match(/\d+/g) ?? []).map(Number);
    const bv = (b.match(/\d+/g) ?? []).map(Number);
    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
      const difference = (bv[i] ?? 0) - (av[i] ?? 0);
      if (difference) return difference;
    }
    return 0;
  });
}

/**
 * Plano B: os próximos da lista e, se nenhum deles for, o primeiro modelo "leve"
 * (lite, mini, haiku, small). Quando os grandes estão sobrecarregados, o leve
 * costuma responder — foi o caso real do Gemini.
 */
export function pickFallbacks(ranked: string[], chosen: string): string[] {
  const rest = ranked.filter((id) => id !== chosen);
  const picked = rest.slice(0, 2);
  // Parte do nome separada por hífen: "gemini" contém "mini", mas não é leve.
  const light = rest.find((id) => /(^|[-_.:/])(lite|mini|haiku|small)([-_.:]|$)/i.test(id));
  if (light && !picked.includes(light)) picked.push(light);
  return picked;
}

export function createCallLlm(
  settings: LlmSettings,
  signal?: AbortSignal,
  onModel?: (used: string, skipped: { model: string; code: LlmErrorCode }[]) => void,
): CallLlm {
  return async (messages) => {
    const skipped: { model: string; code: LlmErrorCode }[] = [];
    let firstError: LlmError | undefined;
    const queue = [...new Set([settings.model, ...(settings.fallbackModels ?? [])])];
    // Sem plano B salvo (configuração antiga ou modelo digitado à mão): monta na primeira falha.
    let discovered = queue.length > 1;
    for (let i = 0; i < queue.length; i++) {
      const model = queue[i]!;
      let result: string;
      try {
        result = await createModelCall({ ...settings, model }, signal)(messages);
      } catch (error) {
        if (!(error instanceof LlmError) || (error.code !== "model" && error.code !== "overloaded"))
          throw error;
        firstError ??= error;
        skipped.push({ model, code: error.code });
        if (!discovered) {
          discovered = true;
          try {
            const ranked = rankModels(
              await listModels(settings, signal),
              settings.provider,
              settings.baseUrl,
            );
            const fallbacks = pickFallbacks(ranked, settings.model);
            queue.push(...fallbacks.filter((id) => !queue.includes(id)));
            if (fallbacks.length) saveLlmSettings({ ...settings, fallbackModels: fallbacks });
          } catch {
            /* Sem lista de modelos: fica o erro original. */
          }
        }
        continue;
      }
      onModel?.(model, skipped);
      return result;
    }
    throw firstError;
  };
}

function createModelCall(s: LlmSettings, signal?: AbortSignal): CallLlm {
  return async (messages) => {
    const timeout = AbortSignal.timeout(300_000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const checkAbort = () => {
      if (signal?.aborted) throw new LlmError("canceled");
      if (timeout.aborted) throw new LlmError("timeout");
    };
    checkAbort();
    if (s.provider === "anthropic") {
      // SDK carregado só quando usado: quem usa uma API compatível nunca baixa.
      let Anthropic: typeof import("@anthropic-ai/sdk").default;
      try {
        ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
      } catch {
        checkAbort();
        throw new LlmError("network");
      }
      try {
        checkAbort();
        const client = new Anthropic({ apiKey: s.apiKey, dangerouslyAllowBrowser: true, maxRetries: 0 });
        const res = await client.messages.create(
          {
            model: s.model,
            max_tokens: 16000,
            system: messages.system,
            messages: [{ role: "user", content: messages.user }],
          },
          { signal: combinedSignal, timeout: 300_000 },
        );
        checkAbort();
        if (res.stop_reason === "refusal") throw new LlmError("refused");
        if (res.stop_reason === "max_tokens") throw new LlmError("truncated");
        return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      } catch (error) {
        checkAbort();
        if (error instanceof LlmError) throw error;
        if (error instanceof Anthropic.AuthenticationError) throw new LlmError("auth", error.status);
        if (error instanceof Anthropic.NotFoundError)
          throw new LlmError("model", error.status, error.message);
        if (error instanceof Anthropic.RateLimitError) throw new LlmError("rate_limit", error.status);
        if (error instanceof Anthropic.APIUserAbortError) throw new LlmError("canceled");
        if (error instanceof Anthropic.APIConnectionTimeoutError) throw new LlmError("timeout");
        if (error instanceof Anthropic.APIConnectionError) throw new LlmError("network");
        if (error instanceof Anthropic.APIError) throw apiError(error.status, error.message);
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
          signal: combinedSignal,
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
      checkAbort();
      throw new LlmError("network");
    }
    checkAbort();
    if (!res.ok) {
      const error = await responseError(res);
      checkAbort();
      throw error;
    }
    try {
      const data = await res.json();
      checkAbort();
      const choice = data.choices?.[0];
      if (choice?.finish_reason === "length") throw new LlmError("truncated");
      if (choice?.message?.refusal) throw new LlmError("refused");
      if (typeof choice?.message?.content !== "string") throw new LlmError("api");
      return choice.message.content;
    } catch (error) {
      checkAbort();
      throw error instanceof LlmError ? error : new LlmError("api");
    }
  };
}

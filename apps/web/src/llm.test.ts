import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCallLlm,
  listModels,
  loadLlmSettings,
  pickFallbacks,
  presets,
  rankModels,
  type LlmSettings,
} from "./llm";

const settings: LlmSettings = {
  provider: "openai-compatible",
  baseUrl: presets.gemini,
  apiKey: "test-key",
  model: "gemini-2.5-flash",
  fallbackModels: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
  remember: false,
};
const messages = { system: "Return JSON", user: "Hello" };
const success = () => Response.json({ choices: [{ message: { content: "{}" } }] });
const failure = (status: number, message: string, array = false) =>
  Response.json(array ? [{ error: { message } }] : { error: { message } }, { status });

afterEach(() => vi.unstubAllGlobals());

describe("listModels", () => {
  it("normalizes, deduplicates and filters non-text model IDs", async () => {
    const excluded = [
      "embedding",
      "tts",
      "whisper",
      "dall-e",
      "imagen",
      "image",
      "audio",
      "speech",
      "moderation",
      "realtime",
      "transcribe",
      "aqa",
      "veo",
      "lyria",
    ];
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          { id: "models/gemini-3.8-flash" },
          { id: "gemini-3.8-flash" },
          { id: "text-model" },
          ...excluded.map((id) => ({ id: `models/${id}` })),
          { id: 42 },
          {},
          null,
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(listModels(settings)).resolves.toEqual(["gemini-3.8-flash", "text-model"]);
    expect(fetch).toHaveBeenCalledWith(
      `${presets.gemini}/models`,
      expect.objectContaining({
        headers: { Authorization: "Bearer test-key" },
      }),
    );
  });

  it("allows a local provider without an API key and forwards abort", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetch);
    const controller = new AbortController();
    await listModels({ ...settings, baseUrl: `${presets.ollama}/`, apiKey: "" }, controller.signal);
    expect(fetch).toHaveBeenCalledWith(`${presets.ollama}/models`, {
      signal: controller.signal,
      headers: {},
    });
  });

  it("maps list errors and preserves provider detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failure(400, "Invalid API key", true)));
    await expect(listModels(settings)).rejects.toMatchObject({ code: "auth", detail: "Invalid API key" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failure(404, "No models endpoint")));
    await expect(listModels(settings)).rejects.toMatchObject({ code: "api", detail: "No models endpoint" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(listModels(settings)).rejects.toMatchObject({ code: "network", detail: "Failed to fetch" });
  });
});

describe("rankModels", () => {
  it("prefers stable Gemini Flash, numeric versions, then lite and other models", () => {
    const ids = [
      "gemini-3.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-4.0-flash-preview",
      "gemini-3.6-flash",
      "embedding-9",
      "gemini-3.8-flash",
      "gemini-5-flash-exp",
    ];
    expect(rankModels(ids, "openai-compatible", presets.gemini)).toEqual([
      "gemini-3.8-flash",
      "gemini-3.6-flash",
      "gemini-2.5-flash",
      "gemini-5-flash-exp",
      "gemini-4.0-flash-preview",
      "gemini-3.5-flash-lite",
      "embedding-9",
    ]);
    expect(ids[0]).toBe("gemini-3.5-flash-lite");
    expect(
      rankModels(["gemini-3.8-flash", "gemini-3.10-flash"], "openai-compatible", presets.gemini)[0],
    ).toBe("gemini-3.10-flash");
  });

  it("prefers Anthropic families before descending versions", () => {
    expect(
      rankModels(
        ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-4-6", "claude-opus-5-5"],
        "anthropic",
        "",
      ),
    ).toEqual(["claude-opus-5-5", "claude-opus-4-6", "claude-sonnet-5-5", "claude-haiku-5-5"]);
  });

  it("sorts other providers by numeric version and preserves ties", () => {
    expect(
      rankModels(["first-3.8", "old-2.5", "second-3.8", "new-3.10"], "openai-compatible", presets.openai),
    ).toEqual(["new-3.10", "first-3.8", "second-3.8", "old-2.5"]);
  });
});

describe("createCallLlm", () => {
  it.each([false, true])("maps OpenAI/Gemini error bodies (array: %s)", async (array) => {
    for (const [status, message, code] of [
      [404, "Model no longer available to new users", "model"],
      [400, "Model no longer available to new users", "model"],
      [503, "Busy", "overloaded"],
      [529, "Busy", "overloaded"],
      [400, "High demand", "overloaded"],
      [500, "Overloaded", "overloaded"],
      [500, "Service unavailable", "overloaded"],
    ] as const) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(failure(status, message, array)));
      await expect(createCallLlm({ ...settings, fallbackModels: [] })(messages)).rejects.toMatchObject({
        code,
        status,
        detail: message,
      });
    }
  });

  it("falls back from 404 to 503 to success and reports skipped models", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(failure(404, "No longer available", true))
      .mockResolvedValueOnce(failure(503, "High demand", true))
      .mockResolvedValueOnce(success());
    vi.stubGlobal("fetch", fetch);
    const onModel = vi.fn();
    await expect(createCallLlm(settings, undefined, onModel)(messages)).resolves.toBe("{}");
    expect(fetch.mock.calls.map(([, init]) => JSON.parse(init.body).model)).toEqual([
      settings.model,
      ...settings.fallbackModels,
    ]);
    expect(onModel).toHaveBeenCalledWith("gemini-3.5-flash-lite", [
      { model: settings.model, code: "model" },
      { model: "gemini-3.8-flash", code: "overloaded" },
    ]);
  });

  it("monta o plano B na hora quando a configuração não tem um (caso real: config antiga)", async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/models"))
        return Response.json({
          data: [
            { id: "models/gemini-3.8-flash" },
            { id: "models/gemini-3.6-flash" },
            { id: "models/gemini-3.5-flash-lite" },
          ],
        });
      const model = JSON.parse(String(init?.body)).model;
      return model === "gemini-3.5-flash-lite" ? success() : failure(503, "High demand", true);
    });
    vi.stubGlobal("fetch", fetch);
    const onModel = vi.fn();
    const old = { ...settings, model: "gemini-3.8-flash", fallbackModels: [] };
    await expect(createCallLlm(old, undefined, onModel)(messages)).resolves.toBe("{}");
    expect(onModel).toHaveBeenCalledWith("gemini-3.5-flash-lite", [
      { model: "gemini-3.8-flash", code: "overloaded" },
      { model: "gemini-3.6-flash", code: "overloaded" },
    ]);
  });

  it.each([401, 429, 500])("does not try fallback for status %s", async (status) => {
    const fetch = vi.fn().mockResolvedValue(failure(status, "Request failed"));
    vi.stubGlobal("fetch", fetch);
    await expect(createCallLlm(settings)(messages)).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("throws the first error when all fallback models fail", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(failure(404, "First error"))
      .mockResolvedValueOnce(failure(503, "Second error"))
      .mockResolvedValueOnce(failure(529, "Third error"));
    vi.stubGlobal("fetch", fetch);
    const onModel = vi.fn();
    await expect(createCallLlm(settings, undefined, onModel)(messages)).rejects.toMatchObject({
      code: "model",
      status: 404,
      detail: "First error",
    });
    expect(onModel).not.toHaveBeenCalled();
  });

  it("stops on network errors or an aborted signal", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Offline"));
    vi.stubGlobal("fetch", fetch);
    await expect(createCallLlm(settings)(messages)).rejects.toMatchObject({ code: "network" });
    expect(fetch).toHaveBeenCalledTimes(1);
    const controller = new AbortController();
    controller.abort();
    await expect(createCallLlm(settings, controller.signal)(messages)).rejects.toMatchObject({
      code: "canceled",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it("loads older settings with no fallbacks", () => {
  const { fallbackModels: _fallbackModels, ...old } = settings;
  vi.stubGlobal("sessionStorage", { getItem: () => JSON.stringify(old) });
  expect(loadLlmSettings()?.fallbackModels).toEqual([]);
});

describe("pickFallbacks", () => {
  it("inclui um modelo leve mesmo quando ele está fora dos dois próximos", () => {
    const ranked = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-3.5-flash-lite"];
    expect(pickFallbacks(ranked, "gemini-3.8-flash")).toEqual([
      "gemini-3.6-flash",
      "gemini-2.5-flash",
      "gemini-3.5-flash-lite",
    ]);
  });
});

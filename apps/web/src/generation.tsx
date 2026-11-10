import { useEffect, useRef, useState } from "react";
import {
  analyzeFit,
  generateResumeDraft,
  ResumeDraftSchema,
  type FactBank,
  type ResumeDraft,
  type CallLlm,
} from "@encaixe/core";
import { useI18n, type Locale, type TranslationKey } from "./i18n";
import { Modal } from "./bank/ui";
import {
  clearLlmSettings,
  createCallLlm,
  isLocalBaseUrl,
  isValidBaseUrl,
  LlmError,
  listModels,
  loadLlmSettings,
  presets,
  pickFallbacks,
  rankModels,
  saveLlmSettings,
  type LlmSettings,
  type LlmErrorCode,
} from "./llm";

export interface SavedDraft {
  draft: ResumeDraft;
  jobText: string;
  locale: Locale;
}
export function loadDraft(): SavedDraft | undefined {
  try {
    const value = JSON.parse(localStorage.getItem("encaixe.draft") ?? "null");
    if (!value || typeof value.jobText !== "string" || (value.locale !== "pt-BR" && value.locale !== "en"))
      return;
    const result = ResumeDraftSchema.safeParse(value.draft);
    if (result.success) return { draft: result.data, jobText: value.jobText, locale: value.locale };
  } catch {
    /* Invalid or inaccessible drafts are never rendered. */
  }
}
export function saveDraft(value: SavedDraft): boolean {
  try {
    localStorage.setItem("encaixe.draft", JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function LlmDialog({ onClose, onSave }: { onClose: () => void; onSave: (s: LlmSettings) => void }) {
  const { t } = useI18n();
  const [settings, setSettings] = useState<LlmSettings>(
    () =>
      loadLlmSettings() ?? {
        provider: "anthropic",
        baseUrl: presets.openai,
        model: "",
        fallbackModels: [],
        apiKey: "",
        remember: false,
      },
  );
  const [preset, setPreset] = useState<keyof typeof presets | "custom">(
    () =>
      (Object.keys(presets) as (keyof typeof presets)[]).find((name) => presets[name] === settings.baseUrl) ??
      "custom",
  );
  const [error, setError] = useState<TranslationKey>();
  const compatible = settings.provider === "openai-compatible";
  const keyRequired = !compatible || !isLocalBaseUrl(settings.baseUrl);
  const [models, setModels] = useState<string[]>([]);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState<LlmError>();
  const [manualModel, setManualModel] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const { provider, baseUrl, apiKey } = settings;
  const canList =
    (!compatible || isValidBaseUrl(settings.baseUrl)) && (!keyRequired || !!settings.apiKey.trim());
  useEffect(() => {
    const controller = new AbortController();
    setModels([]);
    setListError(undefined);
    setListing(false);
    setManualModel(false);
    if (!canList) return;
    const timer = setTimeout(async () => {
      setListing(true);
      try {
        const ids = rankModels(
          await listModels({ provider, baseUrl, apiKey }, controller.signal),
          provider,
          baseUrl,
        );
        if (controller.signal.aborted) return;
        setModels(ids);
        const recommended = ids[0];
        if (recommended !== undefined) {
          setSettings((current) => ({
            ...current,
            model: ids.includes(current.model) ? current.model : recommended,
          }));
        }
      } catch (cause) {
        if (!controller.signal.aborted) setListError(cause instanceof LlmError ? cause : new LlmError("api"));
      } finally {
        if (!controller.signal.aborted) setListing(false);
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [provider, baseUrl, apiKey, canList, refresh]);
  const fallbacks = pickFallbacks(models, settings.model.trim());
  return (
    <Modal title={t("llm.title")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (compatible && !isValidBaseUrl(settings.baseUrl)) {
            setError("llm.invalidBaseUrl");
            return;
          }
          if (!settings.model.trim() || (keyRequired && !settings.apiKey.trim())) return;
          const value = {
            ...settings,
            baseUrl: settings.baseUrl.trim(),
            model: settings.model.trim(),
            apiKey: settings.apiKey.trim(),
            fallbackModels: fallbacks,
          };
          saveLlmSettings(value);
          onSave(value);
        }}
      >
        <fieldset>
          <legend>{t("llm.provider")}</legend>
          {(["anthropic", "openai-compatible"] as const).map((provider) => (
            <label className="flex min-h-10 items-center gap-2" key={provider}>
              <input
                type="radio"
                name="provider"
                value={provider}
                checked={settings.provider === provider}
                onChange={() =>
                  setSettings({
                    ...settings,
                    provider,
                    model: "",
                    fallbackModels: [],
                  })
                }
              />
              {t(`llm.${provider}`)}
            </label>
          ))}
        </fieldset>
        {compatible && (
          <>
            <label className="block">
              {t("llm.preset")}
              <select
                className="rounded-lg border border-line bg-bg p-3 text-ink min-h-10 w-full"
                value={preset}
                onChange={(e) => {
                  const name = e.target.value as keyof typeof presets | "custom";
                  setPreset(name);
                  setError(undefined);
                  if (name !== "custom") setSettings({ ...settings, baseUrl: presets[name] });
                }}
              >
                {(Object.keys(presets) as (keyof typeof presets)[]).map((name) => (
                  <option key={name} value={name}>
                    {t(`llm.preset.${name}`)}
                  </option>
                ))}
                <option value="custom">{t("llm.preset.custom")}</option>
              </select>
            </label>
            <label className="block">
              {t("llm.baseUrl")}
              <input
                className="rounded-lg border border-line bg-bg p-3 text-ink min-h-10 w-full"
                required
                value={settings.baseUrl}
                aria-invalid={error === "llm.invalidBaseUrl"}
                aria-describedby={error === "llm.invalidBaseUrl" ? "llm-url-error" : undefined}
                onChange={(e) => {
                  setSettings({ ...settings, baseUrl: e.target.value });
                  setPreset("custom");
                  setError(undefined);
                }}
              />
            </label>
            {error && (
              <p id="llm-url-error" role="alert" className="bank-errors">
                {t(error)}
              </p>
            )}
          </>
        )}
        <label className="block">
          {t("llm.model")}
          {models.length > 0 && !manualModel ? (
            <select
              className="rounded-lg border border-line bg-bg p-3 text-ink min-h-10 w-full"
              value={settings.model}
              onChange={(e) => {
                if (e.target.value === "") {
                  setManualModel(true);
                  setSettings({ ...settings, model: "" });
                } else setSettings({ ...settings, model: e.target.value });
              }}
            >
              {models.map((model, index) => (
                <option key={model} value={model}>
                  {model}
                  {index === 0 ? ` (${t("llm.recommended")})` : ""}
                </option>
              ))}
              <option value="">{t("llm.other")}</option>
            </select>
          ) : (
            <input
              className="rounded-lg border border-line bg-bg p-3 text-ink min-h-10 w-full"
              required
              value={settings.model}
              aria-describedby={compatible ? "llm-model-hint" : undefined}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            />
          )}
        </label>
        <button
          className="bank-button min-h-10"
          type="button"
          disabled={!canList || listing}
          onClick={() => setRefresh((value) => value + 1)}
        >
          {t("llm.refreshModels")}
        </button>
        {listing && (
          <p className="text-sm text-muted" role="status">
            {t("llm.loadingModels")}
          </p>
        )}
        {listError && (
          <div role="alert" className="bank-errors">
            <p>{t(listError.code === "canceled" ? "generation.network" : `generation.${listError.code}`)}</p>
            {listError.detail && (
              <p className="break-words font-mono text-xs">
                {t("generation.detail")} {listError.detail}
              </p>
            )}
          </div>
        )}
        {fallbacks.length > 0 && (
          <p className="text-sm text-muted">{t("llm.fallbacks", { fallbacks: fallbacks.join(", ") })}</p>
        )}
        {compatible && (
          <p id="llm-model-hint" className="text-sm text-muted">
            {t(`llm.modelHint.${preset}`)}
          </p>
        )}
        <label className="block">
          {t(compatible ? "llm.compatibleKey" : "llm.key")}
          <input
            className="rounded-lg border border-line bg-bg p-3 text-ink min-h-10 w-full"
            type="password"
            autoComplete="off"
            required={keyRequired}
            value={settings.apiKey}
            onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
          />
        </label>
        <label className="flex min-h-10 items-center gap-2">
          <input
            type="checkbox"
            checked={settings.remember}
            onChange={(e) => setSettings({ ...settings, remember: e.target.checked })}
          />
          {t("llm.remember")}
        </label>
        <p className="text-sm text-muted">{t("llm.privacy")}</p>
        {compatible && (
          <>
            {preset === "ollama" && (
              <p className="text-sm text-muted">{t("llm.ollamaHelp", { origin: location.origin })}</p>
            )}
            <p className="text-sm text-muted">{t("llm.freePlans")}</p>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="bank-button min-h-10" type="submit">
            {t("editor.save")}
          </button>
          <button
            className="bank-button min-h-10"
            type="button"
            onClick={() => {
              clearLlmSettings();
              setSettings({ ...settings, apiKey: "", remember: false });
            }}
          >
            {t("llm.clear")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function useLlmTask() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const controller = useRef<AbortController | undefined>(undefined);
  useEffect(
    () => () => {
      controller.current?.abort();
      controller.current = undefined;
    },
    [],
  );
  const [error, setErrorKey] = useState<TranslationKey>();
  const [detail, setDetail] = useState<string>();
  const [modelStatus, setModelStatus] = useState<{
    used: string;
    skipped: { model: string; code: LlmErrorCode }[];
  }>();
  const setError = (key: TranslationKey | undefined, providerDetail?: string) => {
    setErrorKey(key);
    setDetail(providerDetail);
  };
  const [dialog, setDialog] = useState<"configure" | "generate">();
  const settingsRef = useRef<LlmSettings | undefined>(undefined);
  const lastTask = useRef<((callLlm: CallLlm) => Promise<void>) | undefined>(undefined);
  async function execute(settings: LlmSettings, task: (callLlm: CallLlm) => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    const execution = new AbortController();
    controller.current = execution;
    setBusy(true);
    setError(undefined);
    setModelStatus(undefined);
    try {
      await task(
        createCallLlm(settings, execution.signal, (used, skipped) => {
          if (controller.current === execution && !execution.signal.aborted && skipped.length)
            setModelStatus({ used, skipped });
        }),
      );
    } catch (cause) {
      if (controller.current !== execution || execution.signal.aborted) return;
      if (cause instanceof LlmError) {
        if (cause.code !== "canceled") setError(`generation.${cause.code}`, cause.detail);
      } else {
        setError("generation.api");
      }
    } finally {
      locked.current = false;
      if (controller.current === execution) {
        controller.current = undefined;
        setBusy(false);
      }
    }
  }
  function run(task: (callLlm: CallLlm) => Promise<void>) {
    if (locked.current || dialog) return;
    lastTask.current = task;
    const settings = settingsRef.current ?? loadLlmSettings();
    if (settings) void execute(settings, task);
    else setDialog("generate");
  }
  return {
    busy,
    run,
    error,
    setError,
    controls: (
      <>
        <button
          type="button"
          className="bank-button min-h-10 underline"
          disabled={busy}
          onClick={() => setDialog("configure")}
        >
          {t("llm.configure")}
        </button>
        {busy && (
          <button type="button" className="bank-button min-h-10" onClick={() => controller.current?.abort()}>
            {t("editor.cancel")}
          </button>
        )}
        {error && (
          <div role="alert" className="bank-errors">
            <p>{t(error)}</p>
            {detail && (
              <p className="break-words font-mono text-xs">
                {t("generation.detail")} {detail}
              </p>
            )}
            <button
              type="button"
              className="bank-button min-h-10"
              disabled={busy || !lastTask.current}
              onClick={() => {
                if (lastTask.current) run(lastTask.current);
              }}
            >
              {t("generation.retry")}
            </button>
          </div>
        )}
        {modelStatus && (
          <p role="status" className="text-sm text-muted">
            {t("generation.modelStatus", {
              used: modelStatus.used,
              skipped: modelStatus.skipped
                .map(({ model, code }) =>
                  t(
                    code === "overloaded" ? "generation.skippedOverloaded" : "generation.skippedUnavailable",
                    { model },
                  ),
                )
                .join(", "),
            })}
          </p>
        )}
        {dialog && (
          <LlmDialog
            onClose={() => {
              settingsRef.current = undefined;
              setDialog(undefined);
            }}
            onSave={(settings) => {
              settingsRef.current = settings;
              const shouldGenerate = dialog === "generate";
              setDialog(undefined);
              if (shouldGenerate && lastTask.current) void execute(settings, lastTask.current);
            }}
          />
        )}
      </>
    ),
  };
}

export function useGeneration(
  bank: FactBank,
  jobText: string,
  locale: Locale,
  onSuccess: (value: SavedDraft) => void,
) {
  const task = useLlmTask();
  function generate() {
    task.run(async (callLlm) => {
      const { result } = await generateResumeDraft(
        { bank, jobText, fit: analyzeFit(bank, jobText), locale },
        callLlm,
      );
      if (!result.ok) {
        task.setError(`generation.${result.error}`);
        return;
      }
      const value = { draft: result.draft, jobText, locale };
      if (!saveDraft(value)) {
        task.setError("generation.storage");
        return;
      }
      onSuccess(value);
    });
  }
  return { busy: task.busy, generate, controls: task.controls };
}

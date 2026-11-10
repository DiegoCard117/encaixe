import { useRef, useState } from "react";
import {
  analyzeFit,
  generateResumeDraft,
  ResumeDraftSchema,
  type FactBank,
  type ResumeDraft,
} from "@encaixe/core";
import { useI18n, type Locale, type TranslationKey } from "./i18n";
import { Modal } from "./bank/ui";
import {
  clearLlmSettings,
  createCallLlm,
  LlmError,
  loadLlmSettings,
  saveLlmSettings,
  type LlmSettings,
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
        model: "claude-opus-5-5",
        apiKey: "",
        remember: false,
      },
  );
  return (
    <Modal title={t("llm.title")} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!settings.model.trim() || !settings.apiKey.trim()) return;
          const value = { ...settings, model: settings.model.trim(), apiKey: settings.apiKey.trim() };
          saveLlmSettings(value);
          onSave(value);
        }}
      >
        <fieldset>
          <legend>{t("llm.provider")}</legend>
          {(["anthropic", "openai"] as const).map((provider) => (
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
                    model: provider === "anthropic" ? "claude-opus-5-5" : "",
                  })
                }
              />
              {t(`llm.${provider}`)}
            </label>
          ))}
        </fieldset>
        <label className="block">
          {t("llm.model")}
          {settings.provider === "anthropic" ? (
            <select
              className="rounded-lg border border-line bg-bg p-3 text-ink min-h-10 w-full"
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            >
              {["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"].map((model) => (
                <option key={model}>{model}</option>
              ))}
            </select>
          ) : (
            <input
              className="rounded-lg border border-line bg-bg p-3 text-ink min-h-10 w-full"
              required
              value={settings.model}
              onChange={(e) => setSettings({ ...settings, model: e.target.value })}
            />
          )}
        </label>
        <label className="block">
          {t("llm.key")}
          <input
            className="rounded-lg border border-line bg-bg p-3 text-ink min-h-10 w-full"
            type="password"
            autoComplete="off"
            required
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

export function useGeneration(
  bank: FactBank,
  jobText: string,
  locale: Locale,
  onSuccess: (value: SavedDraft) => void,
) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<TranslationKey>();
  const [dialog, setDialog] = useState<"configure" | "generate">();
  const settingsRef = useRef<LlmSettings | undefined>(undefined);
  async function run(settings: LlmSettings) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const { result } = await generateResumeDraft(
        { bank, jobText, fit: analyzeFit(bank, jobText), locale },
        createCallLlm(settings),
      );
      if (!result.ok) {
        setError(`generation.${result.error}`);
        return;
      }
      const value = { draft: result.draft, jobText, locale };
      if (!saveDraft(value)) {
        setError("generation.storage");
        return;
      }
      onSuccess(value);
    } catch (cause) {
      setError(cause instanceof LlmError ? `generation.${cause.code}` : "generation.api");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function generate() {
    const settings = settingsRef.current ?? loadLlmSettings();
    if (settings) void run(settings);
    else setDialog("generate");
  }
  return {
    busy,
    generate,
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
        {error && (
          <div role="alert" className="bank-errors">
            <p>{t(error)}</p>
            <button type="button" className="bank-button min-h-10" disabled={busy} onClick={generate}>
              {t("generation.retry")}
            </button>
          </div>
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
              if (shouldGenerate) void run(settings);
            }}
          />
        )}
      </>
    ),
  };
}

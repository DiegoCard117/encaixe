import { useState } from "react";
import { Modal } from "../bank/ui";
import { useI18n } from "../i18n";
import { validateConfig, type ConfigError } from "./supabase";
import type { useSync } from "./useSync";

export default function SyncCard({ sync }: { sync: ReturnType<typeof useSync> }) {
  const { t, locale } = useI18n();
  const [dialog, setDialog] = useState(false);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string>();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ConfigError>();
  const { state } = sync;
  const date = (value?: string) =>
    value && Number.isFinite(Date.parse(value))
      ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
      : t("sync.unknownDate");
  const inputClass = "min-h-10 w-full min-w-0 rounded-lg border border-line bg-bg p-3 text-base text-ink";
  return (
    <section className="bank-card min-w-0 space-y-3 break-words" aria-busy={state.status === "syncing"}>
      <h3 className="font-display font-semibold">{t("editor.remote")}</h3>
      {state.status === "off" && (
        <>
          <p className="text-sm text-muted">{t("editor.remoteHelp")}</p>
          <button type="button" className="bank-button" onClick={() => setDialog(true)}>
            {t("sync.connect")}
          </button>
        </>
      )}
      {state.status === "signed_out" && (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (sending) return;
            const address = email.trim();
            setSending(true);
            void sync
              .sendLink(address)
              .then((ok) => {
                if (ok) setSent(address);
              })
              .finally(() => setSending(false));
          }}
        >
          <label className="block">
            {t("field.email")}
            <input
              className={inputClass}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button type="submit" className="bank-button" disabled={sending}>
            {t("sync.sendLink")}
          </button>
          {sent && (
            <p role="status" className="text-sm">
              {t("sync.sent", { email: sent })}
            </p>
          )}
        </form>
      )}
      {state.status === "idle" && (
        <>
          <p>{t("sync.connected", { email: state.email })}</p>
          {state.syncedAt && (
            <p className="text-sm text-muted">{t("sync.synced", { time: date(state.syncedAt) })}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="bank-button" onClick={() => void sync.sync()}>
              {t("sync.now")}
            </button>
            <button
              type="button"
              className="bank-button"
              onClick={() => {
                setSent(undefined);
                void sync.disconnect();
              }}
            >
              {t("sync.signOut")}
            </button>
          </div>
        </>
      )}
      {state.status === "syncing" && <p role="status">{t("sync.syncing")}</p>}
      {state.status === "conflict" && (
        <>
          <div role="alert" className="space-y-2 text-sm">
            <p>{t("sync.conflict")}</p>
            <p>{t("sync.localSummary", { count: state.local.count, date: date(state.local.date) })}</p>
            <p>{t("sync.remoteSummary", { count: state.remote.count, date: date(state.remote.date) })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="bank-button whitespace-normal"
              onClick={() => void sync.resolve("local")}
            >
              {t("sync.keepLocal")}
            </button>
            <button
              type="button"
              className="bank-button whitespace-normal"
              onClick={() => {
                if (window.confirm(t("sync.replaceConfirm"))) void sync.resolve("remote");
              }}
            >
              {t("sync.useRemote")}
            </button>
          </div>
        </>
      )}
      {state.status === "error" && (
        <>
          <p role="alert" className="bank-errors">
            {t(`sync.error.${state.code}`)}
          </p>
          <button type="button" className="bank-button" onClick={() => void sync.sync()}>
            {t("sync.retry")}
          </button>
        </>
      )}
      {state.status !== "off" && state.status !== "syncing" && (
        <button
          type="button"
          className="bank-button"
          disabled={sending}
          onClick={() => {
            setSent(undefined);
            void sync.disconnect(true);
          }}
        >
          {t("sync.remove")}
        </button>
      )}
      {dialog && (
        <Modal title={t("sync.connect")} onClose={() => setDialog(false)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const invalid = validateConfig(url.trim(), key.trim());
              setError(invalid);
              if (!invalid && sync.connect({ url: url.trim(), key: key.trim() })) {
                setDialog(false);
                setKey("");
              }
            }}
          >
            <label className="block">
              {t("sync.url")}
              <input
                className={inputClass}
                required
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <label className="block">
              {t("sync.key")}
              <input
                className={inputClass}
                required
                type="password"
                autoComplete="off"
                value={key}
                onChange={(event) => setKey(event.target.value)}
              />
            </label>
            <p className="text-sm text-muted">{t("sync.keyHint")}</p>
            <a
              className="inline-block min-h-10 text-accent-ink underline"
              href="https://github.com/DiegoCard117/encaixe/blob/main/docs/supabase.md"
              target="_blank"
              rel="noreferrer"
            >
              {t("sync.help")}
            </a>
            {error && (
              <p role="alert" className="bank-errors">
                {t(`sync.error.${error}`)}
              </p>
            )}
            <button type="submit" className="bank-button">
              {t("editor.save")}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

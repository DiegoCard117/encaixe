import { useState } from "react";
import { Modal } from "../bank/ui";
import { useI18n } from "../i18n";
import {
  connectionLink,
  loadSyncConfig,
  setPassword,
  syncError,
  validateConfig,
  type ConfigError,
  type SyncError,
} from "./supabase";
import type { useSync } from "./useSync";

export default function SyncCard({ sync }: { sync: ReturnType<typeof useSync> }) {
  const { t, locale } = useI18n();
  const [dialog, setDialog] = useState(false);
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [email, setEmail] = useState(() => {
    try {
      return sessionStorage.getItem("encaixe.connectEmail") ?? "";
    } catch {
      return "";
    }
  });
  const [loginMode, setLoginMode] = useState<"email" | "password">("email");
  const [loginAttempted, setLoginAttempted] = useState(false);
  const [password, setLoginPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordError, setPasswordError] = useState<SyncError>();
  const [copied, setCopied] = useState<boolean>();
  const [sent, setSent] = useState<string>();
  const [token, setToken] = useState("");
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
      {(state.status === "signed_out" || (state.status === "error" && (!!sent || loginAttempted))) && (
        <>
          <div className="flex flex-wrap gap-2">
            {(["email", "password"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className="bank-button whitespace-normal"
                aria-pressed={loginMode === mode}
                disabled={sending}
                onClick={() => setLoginMode(mode)}
              >
                {t(mode === "email" ? "sync.emailLogin" : "sync.passwordLogin")}
              </button>
            ))}
          </div>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (sending) return;
              const address = email.trim();
              setLoginAttempted(true);
              setSending(true);
              if (loginMode === "password") {
                void sync
                  .signInWithPassword(address, password)
                  .then((ok) => {
                    if (ok) {
                      setLoginPassword("");
                      setLoginAttempted(false);
                    }
                  })
                  .finally(() => setSending(false));
                return;
              }
              void sync
                .sendLink(address)
                .then((ok) => {
                  if (ok) {
                    setSent(address);
                    setToken("");
                  }
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
            {loginMode === "password" && (
              <label className="block">
                {t("sync.password")}
                <input
                  className={inputClass}
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
              </label>
            )}
            <button type="submit" className="bank-button" disabled={sending}>
              {t(loginMode === "password" ? "sync.signIn" : "sync.sendLink")}
            </button>
            {sent && loginMode === "email" && (
              <p role="status" className="text-sm">
                {t("sync.sent", { email: sent })}
              </p>
            )}
          </form>
          {sent && loginMode === "email" && (
            <form
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (sending || !/^\d{6}$/.test(token)) return;
                setSending(true);
                void sync.verifyCode(sent, token).finally(() => setSending(false));
              }}
            >
              <p className="text-sm text-muted">{t("sync.codeHelp")}</p>
              <label className="block">
                {t("sync.emailCode")}
                <input
                  className={inputClass}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                />
              </label>
              <button type="submit" className="bank-button" disabled={sending}>
                {t("sync.verifyCode")}
              </button>
            </form>
          )}
        </>
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
          <form
            className="space-y-3 border-t border-line pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (passwordSaving || newPassword.length < 8) return;
              setPasswordSaving(true);
              setPasswordSaved(false);
              setPasswordError(undefined);
              void setPassword(newPassword)
                .then(() => {
                  setNewPassword("");
                  setPasswordSaved(true);
                })
                .catch((error: unknown) => setPasswordError(syncError(error)))
                .finally(() => setPasswordSaving(false));
            }}
          >
            <h4 className="font-medium">{t("sync.passwordHeading")}</h4>
            <label className="block">
              {t("sync.newPassword")}
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </label>
            <button type="submit" className="bank-button" disabled={passwordSaving}>
              {t("sync.setPassword")}
            </button>
            <p role="status" className="text-sm">
              {passwordSaved ? t("sync.passwordSaved") : ""}
            </p>
            {passwordError && (
              <div role="alert" className="bank-errors">
                <p>{t(`sync.error.${passwordError.code}`)}</p>
                {passwordError.detail && (
                  <p className="break-words font-mono text-xs">
                    {t("sync.detail")} {passwordError.detail}
                  </p>
                )}
              </div>
            )}
          </form>
          <div className="space-y-3 border-t border-line pt-3">
            <h4 className="font-medium">{t("sync.connectionHeading")}</h4>
            <p className="text-sm text-muted">{t("sync.connectionHelp")}</p>
            <button
              type="button"
              className="bank-button whitespace-normal"
              onClick={async () => {
                setCopied(undefined);
                try {
                  const config = loadSyncConfig();
                  if (!config) throw new Error("not_configured");
                  await navigator.clipboard.writeText(connectionLink(config, state.email));
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {t("sync.copyConnection")}
            </button>
            <p role="status" className="text-sm">
              {copied === undefined ? "" : t(copied ? "sync.connectionCopied" : "sync.connectionCopyFailed")}
            </p>
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
          <div role="alert" className="bank-errors">
            <p>{t(`sync.error.${state.code}`)}</p>
            {state.detail && (
              <p className="break-words font-mono text-xs">
                {t("sync.detail")} {state.detail}
              </p>
            )}
          </div>
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

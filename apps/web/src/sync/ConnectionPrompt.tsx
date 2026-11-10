import { useState } from "react";
import { useI18n } from "../i18n";
import { Modal } from "../bank/ui";
import {
  clearLastSync,
  loadSyncConfig,
  readConnectionLink,
  saveSyncConfig,
  connectionLink,
} from "./supabase";

const key = "encaixe.pendingConnection";

function loadPending() {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    // Revalida pelo mesmo caminho do link: recusa chave secreta e URL inválida.
    return value?.config
      ? readConnectionLink(new URL(connectionLink(value.config, value.email)).hash)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Confirmação do link de conexão. Mostra o endereço do projeto e avisa quando vai trocar
 * uma conexão existente: um link pode ser de outra pessoa, e conectar ao Supabase dela
 * mandaria o banco de fatos para lá.
 */
export default function ConnectionPrompt() {
  const { t } = useI18n();
  const [pending, setPending] = useState(loadPending);
  if (!pending) return null;
  const current = loadSyncConfig();
  const host = new URL(pending.config.url).host;
  const replaces = current && current.url !== pending.config.url;
  const dismiss = () => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* Storage may be unavailable. */
    }
    setPending(undefined);
  };
  return (
    <Modal title={t("connect.title")} onClose={dismiss}>
      <div className="space-y-4">
        <p>{t("connect.question")}</p>
        <p className="break-all rounded-lg border border-line bg-bg p-3 font-mono text-sm">{host}</p>
        {replaces && (
          <p role="alert" className="bank-errors">
            {t("connect.replaces", { host: new URL(current.url).host })}
          </p>
        )}
        <p className="text-sm text-muted">{t("connect.warning")}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="bank-button bg-accent-soft text-accent-ink"
            onClick={() => {
              try {
                if (loadSyncConfig()?.url !== pending.config.url) clearLastSync();
                if (saveSyncConfig(pending.config)) {
                  if (pending.email) sessionStorage.setItem("encaixe.connectEmail", pending.email);
                  else sessionStorage.removeItem("encaixe.connectEmail");
                  sessionStorage.setItem("encaixe.openSettings", "1");
                }
                sessionStorage.removeItem(key);
              } catch {
                /* Storage may be unavailable. */
              }
              location.reload();
            }}
          >
            {t("connect.confirm")}
          </button>
          <button type="button" className="bank-button" onClick={dismiss}>
            {t("editor.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

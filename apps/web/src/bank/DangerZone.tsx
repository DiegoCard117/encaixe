import { useState } from "react";
import type { FactBank } from "@encaixe/core";
import { useI18n } from "../i18n";
import { deleteRemote, loadSyncConfig, signOut, syncError } from "../sync/supabase";
import { download, Modal } from "./ui";

/** Preferências que sobrevivem ao "apagar tudo": não são dados da pessoa. */
const KEEP = new Set(["encaixe.theme", "encaixe.locale"]);

function wipeBrowser() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      for (const key of Object.keys(storage)) {
        // encaixe.* = dados do app; sb-* = sessão do Supabase.
        if ((key.startsWith("encaixe.") && !KEEP.has(key)) || key.startsWith("sb-")) storage.removeItem(key);
      }
    } catch {
      /* Storage indisponível: não há o que apagar. */
    }
  }
}

export default function DangerZone({ bank }: { bank: FactBank }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [alsoRemote, setAlsoRemote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const connected = Boolean(loadSyncConfig());
  const word = t("danger.word");

  async function erase() {
    setBusy(true);
    setError(undefined);
    try {
      if (connected && alsoRemote) await deleteRemote();
      if (connected) await signOut().catch(() => undefined);
    } catch (cause) {
      // Falhou no Supabase: nada local é apagado, para a pessoa poder tentar de novo.
      setError(t(`sync.error.${syncError(cause).code}`));
      setBusy(false);
      return;
    }
    wipeBrowser();
    location.hash = "#/";
    location.reload();
  }

  return (
    <section className="space-y-3 rounded-xl border border-warn-line p-5" aria-labelledby="danger-title">
      <h3 id="danger-title" className="font-display font-semibold text-warn-ink">
        {t("danger.title")}
      </h3>
      <p className="text-sm text-muted">{t("danger.help")}</p>
      <button
        type="button"
        className="bank-button border-warn-line text-warn-ink"
        onClick={() => {
          setTyped("");
          setAlsoRemote(false);
          setError(undefined);
          setOpen(true);
        }}
      >
        {t("danger.open")}
      </button>
      {open && (
        <Modal title={t("danger.confirmTitle")} onClose={() => !busy && setOpen(false)}>
          <form
            className="bank-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (typed.trim().toUpperCase() === word && !busy) void erase();
            }}
          >
            <p>{t("danger.list")}</p>
            <p className="text-sm text-muted">{t("danger.keeps")}</p>
            <button
              type="button"
              className="bank-button"
              onClick={() => download(JSON.stringify(bank, null, 2), "encaixe.bank.json")}
            >
              {t("danger.backup")}
            </button>
            {connected && (
              <label className="bank-check">
                <input
                  type="checkbox"
                  checked={alsoRemote}
                  onChange={(event) => setAlsoRemote(event.target.checked)}
                />
                {t("danger.remote")}
              </label>
            )}
            <label>
              {t("danger.type", { word })}
              <input
                value={typed}
                autoComplete="off"
                autoCapitalize="characters"
                onChange={(event) => setTyped(event.target.value)}
              />
            </label>
            {error && (
              <p role="alert" className="bank-errors">
                {error}
              </p>
            )}
            <button
              type="submit"
              className="bank-button border-warn-line bg-warn-soft text-warn-ink"
              disabled={busy || typed.trim().toUpperCase() !== word}
            >
              {t(busy ? "danger.busy" : "danger.confirm")}
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}

import { useState } from "react";
import { useI18n } from "./i18n";
import { Modal } from "./bank/ui";
import { support } from "./support";

export default function SupportDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<boolean>();
  async function copy() {
    try {
      await navigator.clipboard.writeText(support.pixKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Modal title={t("support.title")} onClose={onClose}>
      <div className="space-y-5">
        <p>{t("support.intro")}</p>
        {support.pixKey && (
          <section className="space-y-2">
            <h3 className="font-display font-semibold">{t("support.pix")}</h3>
            <p className="break-all rounded-lg border border-line bg-bg p-3 font-mono text-sm">
              {support.pixKey}
            </p>
            <button type="button" className="bank-button" onClick={() => void copy()}>
              {t("support.copy")}
            </button>
            <p
              role="status"
              className={`min-h-5 text-sm ${copied === false ? "text-warn-ink" : "text-accent-ink"}`}
            >
              {copied === undefined ? "" : t(copied ? "support.copied" : "support.copyFailed")}
            </p>
          </section>
        )}
        {support.sponsorsUrl && (
          <a className="bank-button" href={support.sponsorsUrl} target="_blank" rel="noreferrer">
            {t("support.sponsors")}
          </a>
        )}
      </div>
    </Modal>
  );
}

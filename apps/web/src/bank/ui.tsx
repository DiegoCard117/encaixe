import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "../i18n";

export function download(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Errors({ errors }: { errors: string[] }) {
  return errors.length ? (
    <ul role="alert" className="bank-errors">
      {errors.map((error, i) => (
        <li key={i}>{error}</li>
      ))}
    </ul>
  ) : null;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { t } = useI18n();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClose={() => {
        if (!ref.current?.open) onClose();
      }}
      aria-labelledby="bank-dialog-title"
      className="bank-dialog"
    >
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id="bank-dialog-title" className="font-display text-xl font-semibold">
          {title}
        </h2>
        <button type="button" className="bank-button" onClick={onClose}>
          {t("editor.close")}
        </button>
      </div>
      {children}
    </dialog>
  );
}

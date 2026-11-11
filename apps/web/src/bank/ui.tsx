import { useEffect, useId, useRef, type ReactNode } from "react";
import { useI18n } from "../i18n";
import type { Fact } from "@encaixe/core";

export function factTitle(fact: Fact): string {
  switch (fact.kind) {
    case "experience":
      return `${fact.role} · ${fact.company}`;
    case "achievement":
      return fact.text;
    case "education":
      return `${fact.title} · ${fact.institution}`;
    default:
      return fact.name;
  }
}

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
  wide = false,
  variant,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  variant?: "drawer";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useI18n();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    dialog.showModal();
    // Trocar de etapa esconde o editor, mas um <dialog> modal escondido deixaria a página inerte.
    const leave = () => closeRef.current();
    window.addEventListener("hashchange", leave);
    return () => {
      window.removeEventListener("hashchange", leave);
      dialog.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onClose={() => {
        if (!ref.current?.open) onClose();
      }}
      aria-labelledby={titleId}
      className={`bank-dialog ${wide ? "bank-dialog-wide" : ""} ${variant === "drawer" ? "bank-dialog-drawer" : ""}`}
    >
      {/* Cabeçalho fixo: "Fechar" continua ao alcance em janelas longas, como a revisão da importação. */}
      <div className="bank-dialog-header">
        <h2 id={titleId} className="font-display text-xl font-semibold">
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

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Violation } from "@encaixe/core";
import type { ViolationCode } from "../../../packages/core/src/check/anti-invention";
import { VALIDATION_CODES, type ValidationCode } from "../../../packages/core/src/schema/codes";

export type Locale = "pt-BR" | "en";

const ptBR = {
  "app.name": "Encaixe",
  "app.title": "Encaixe — Playground do checador",
  "app.subtitle": "Playground do checador anti-invenção",
  "header.theme": "Tema atual: {theme}. Alternar tema",
  "header.locale": "Idioma atual: Português. Mudar para inglês",
  "header.localeShort": "PT",
  "theme.system": "Sistema",
  "theme.light": "Claro",
  "theme.dark": "Escuro",
  "bank.title": "Banco de fatos",
  "bank.help": "Dados fictícios. Clique em um ID para copiar.",
  "bank.copy": "Copiar ID {id}",
  "bank.copied": "ID copiado: {id}",
  "bank.copyFailed": "Não foi possível copiar. Copie manualmente: {id}",
  "draft.title": "Rascunho (JSON)",
  "draft.reset": "Restaurar exemplo",
  "draft.help":
    "Edite o JSON para conferir as fontes em tempo real. O exemplo contém invenções intencionais.",
  "draft.invalidJson": "JSON inválido",
  "draft.root": "raiz",
  "draft.invalidValue": "Valor inválido",
  "check.count": "{count} violações",
  "check.one": "{count} violação",
  "check.success": "Nenhuma invenção encontrada",
  "check.preview": "Prévia",
  "check.violations": "Violações",
  "check.value": "Valor:",
};

const en: Record<keyof typeof ptBR, string> = {
  "app.name": "Encaixe",
  "app.title": "Encaixe — Checker playground",
  "app.subtitle": "Anti-invention checker playground",
  "header.theme": "Current theme: {theme}. Switch theme",
  "header.locale": "Current language: English. Switch to Portuguese",
  "header.localeShort": "EN",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "bank.title": "Fact bank",
  "bank.help": "Fictional data. Click an ID to copy it.",
  "bank.copy": "Copy ID {id}",
  "bank.copied": "ID copied: {id}",
  "bank.copyFailed": "Could not copy. Copy manually: {id}",
  "draft.title": "Draft (JSON)",
  "draft.reset": "Restore example",
  "draft.help": "Edit the JSON to check sources in real time. The example contains intentional inventions.",
  "draft.invalidJson": "Invalid JSON",
  "draft.root": "root",
  "draft.invalidValue": "Invalid value",
  "check.count": "{count} violations",
  "check.one": "{count} violation",
  "check.success": "No inventions found",
  "check.preview": "Preview",
  "check.violations": "Violations",
  "check.value": "Value:",
};

const violations: Record<Locale, Record<ViolationCode, string>> = {
  "pt-BR": {
    unknown_fact: "Fato desconhecido: {value}",
    archived_fact: "Fato arquivado: {value}",
    wrong_context: "Fonte fora do contexto: {value}",
    unsupported_skill: "Competência sem apoio nas fontes: {value}",
    unsupported_number: "Número sem apoio nas fontes: {value}",
  },
  en: {
    unknown_fact: "Unknown fact: {value}",
    archived_fact: "Archived fact: {value}",
    wrong_context: "Source outside the context: {value}",
    unsupported_skill: "Skill unsupported by the sources: {value}",
    unsupported_number: "Number unsupported by the sources: {value}",
  },
};

const validation: Record<Locale, Record<ValidationCode, string>> = {
  "pt-BR": {
    required: "Campo obrigatório",
    invalid_year_month: "Data inválida; use AAAA-MM",
    period_end_before_start: "O fim do período deve ser igual ou posterior ao início",
    duplicate_tags: "Tags duplicadas",
    invalid_fact_id: "ID de fato inválido",
    fact_id_wrong_kind: "O ID do fato não corresponde ao seu tipo",
    source_required: "Informe pelo menos uma fonte",
    duplicate_id: "ID duplicado: {id}",
    missing_reference: "Referência não encontrada: {id}",
    wrong_reference_kind: "A referência não corresponde ao tipo esperado",
    ambiguous_skill_name: "Nome de competência ambíguo: {name}",
  },
  en: {
    required: "Required field",
    invalid_year_month: "Invalid date; use YYYY-MM",
    period_end_before_start: "The period must end on or after its start",
    duplicate_tags: "Duplicate tags",
    invalid_fact_id: "Invalid fact ID",
    fact_id_wrong_kind: "The fact ID does not match its kind",
    source_required: "Provide at least one source",
    duplicate_id: "Duplicate ID: {id}",
    missing_reference: "Reference not found: {id}",
    wrong_reference_kind: "The reference does not match the expected kind",
    ambiguous_skill_name: "Ambiguous skill name: {name}",
  },
};

type Params = Record<string, unknown>;
type Issue = { message: string; params?: Params };
type TranslationKey = keyof typeof ptBR;

function interpolate(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    params[name] === undefined ? placeholder : String(params[name]),
  );
}

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem("encaixe.locale");
    if (saved === "pt-BR" || saved === "en") return saved;
  } catch {
    // Fall back to the browser language when storage is unavailable.
  }
  return navigator.language.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, params?: Params) => string;
  tViolation: (violation: Violation) => string;
  tIssue: (issue: Issue) => string;
};

const LocaleContext = createContext<I18n | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const dictionary = locale === "pt-BR" ? ptBR : en;

  useEffect(() => {
    try {
      localStorage.setItem("encaixe.locale", locale);
    } catch {
      // Language switching still works without storage.
    }
    document.documentElement.lang = locale;
    document.title = dictionary["app.title"];
  }, [locale, dictionary]);

  const t: I18n["t"] = (key, params) => interpolate(dictionary[key], params);
  const tViolation: I18n["tViolation"] = (violation) =>
    interpolate(violations[locale][violation.code], { value: violation.value });
  const tIssue: I18n["tIssue"] = (issue) => {
    const code = VALIDATION_CODES.find((candidate) => candidate === issue.message);
    return code ? interpolate(validation[locale][code], issue.params) : t("draft.invalidValue");
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t, tViolation, tIssue }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useI18n(): I18n {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useI18n requires LocaleProvider");
  return context;
}

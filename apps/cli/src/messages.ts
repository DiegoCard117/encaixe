import type { ValidationCode, ViolationCode } from "@encaixe/core";

export type Locale = "pt-BR" | "en";

type Dictionary = {
  cli: Record<keyof typeof ptBR.cli, string>;
  violations: Record<ViolationCode, string>;
  validation: Record<ValidationCode, string>;
};

const ptBR = {
  cli: {
    help: "Uso: pnpm cli validate <banco.json> | check <banco.json> <rascunho.json> | fit <banco.json> <vaga.txt>\nOpções: --json, --lang pt-BR|en, --help/-h\nUse - para ler da entrada padrão (no máximo uma vez).",
    invalidUsage: "Comando ou argumentos inválidos. Use --help.",
    readError: "Não foi possível ler: {path}",
    invalidJson: "JSON inválido: {path}",
    invalidValue: "Valor inválido",
    validBank: "Banco válido. Fatos: {count} ({counts}).",
    experience: "experiências",
    achievement: "conquistas",
    project: "projetos",
    education: "formações",
    skill: "skills",
    noViolations: "Nenhuma invenção encontrada.",
    violationsTotal: "Violações: {count}",
    matchedSkills: "Skills que batem",
    gaps: "Lacunas",
    rankedFacts: "Fatos mais relevantes",
    none: "Nenhum",
  },
  violations: {
    unknown_fact: "Fato desconhecido: {value}",
    archived_fact: "Fato arquivado: {value}",
    wrong_context: "Fonte fora do contexto: {value}",
    unsupported_skill: "Skill sem apoio nas fontes: {value}",
    unsupported_number: "Número sem apoio nas fontes: {value}",
  } satisfies Record<ViolationCode, string>,
  validation: {
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
    ambiguous_skill_name: "Nome de skill ambíguo: {name}",
  } satisfies Record<ValidationCode, string>,
};

const en = {
  cli: {
    help: "Usage: pnpm cli validate <bank.json> | check <bank.json> <draft.json> | fit <bank.json> <job.txt>\nOptions: --json, --lang pt-BR|en, --help/-h\nUse - to read standard input (at most once).",
    invalidUsage: "Invalid command or arguments. Use --help.",
    readError: "Could not read: {path}",
    invalidJson: "Invalid JSON: {path}",
    invalidValue: "Invalid value",
    validBank: "Valid bank. Facts: {count} ({counts}).",
    experience: "experiences",
    achievement: "achievements",
    project: "projects",
    education: "education",
    skill: "skills",
    noViolations: "No inventions found.",
    violationsTotal: "Violations: {count}",
    matchedSkills: "Matched skills",
    gaps: "Gaps",
    rankedFacts: "Most relevant facts",
    none: "None",
  },
  violations: {
    unknown_fact: "Unknown fact: {value}",
    archived_fact: "Archived fact: {value}",
    wrong_context: "Source outside the context: {value}",
    unsupported_skill: "Skill unsupported by the sources: {value}",
    unsupported_number: "Number unsupported by the sources: {value}",
  },
  validation: {
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
} satisfies Dictionary;

export const messages = { "pt-BR": ptBR, en } satisfies Record<Locale, Dictionary>;

export function interpolate(text: string, params: Record<string, unknown> = {}): string {
  return text.replace(/\{(\w+)\}/g, (placeholder, key: string) =>
    params[key] === undefined ? placeholder : String(params[key]),
  );
}

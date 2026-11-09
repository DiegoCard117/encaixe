import { indexFacts, type FactBank } from "../schema/bank";
import type { Fact, SkillFact } from "../schema/facts";
import type { ResumeDraft, SourcedText } from "../schema/resume";

export type ViolationCode =
  "unknown_fact" | "archived_fact" | "wrong_context" | "unsupported_skill" | "unsupported_number";

export interface Violation {
  code: ViolationCode;
  /** Caminho no draft até a referência ou o texto problemático. */
  path: (string | number)[];
  /** O id, skill ou número problemático, como aparece. */
  value: string;
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fold = (text: string) => text.toLocaleLowerCase("pt-BR");

function textFields(value: unknown): string[] {
  if (typeof value === "string") return /^https?:\/\//i.test(value) ? [] : [value];
  if (Array.isArray(value)) return value.flatMap(textFields);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, field]) =>
    /^(id|kind|period|date)$|Ids?$|url$/i.test(key) ? [] : textFields(field),
  );
}

/**
 * Números do texto, com `value` normalizado para comparação ("1.000" → "1000", "2,5" → "2.5").
 * Colado em letra antes ("ES2022", "v2") não conta; depois conta ("3x", "10k" precisam de fonte).
 * Algo que não vira número (ex.: versão "4.2.1") é comparado pelo texto bruto.
 */
function numbers(text: string): { raw: string; value: string }[] {
  // ponytail: números por extenso, como "três" ou "dobrou", não são detectados.
  return [...text.matchAll(/(?<![\p{L}\p{N}])\d+(?:[.,]\d+)*/gu)].map(([raw]) => {
    const normalized = /^\d{1,3}(?:[.,]\d{3})+$/.test(raw) ? raw.replace(/[.,]/g, "") : raw.replace(",", ".");
    const value = Number(normalized);
    return { raw, value: Number.isNaN(value) ? raw : String(value) };
  });
}

export function checkResumeDraft(bank: FactBank, draft: ResumeDraft): Violation[] {
  const violations: Violation[] = [];
  const byId = indexFacts(bank);
  const names = new Map<string, SkillFact>();
  // ponytail: tecnologias fora do dicionário de skills do banco não são detectadas.
  for (const fact of bank.facts) {
    if (fact.kind === "skill") {
      for (const name of [fact.name, ...fact.aliases]) names.set(fold(name), fact);
    }
  }
  const alternatives = [...names.keys()].sort((a, b) => b.length - a.length).map(escapeRegex);
  const skillPattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );
  const mentions = (text: string) => (names.size ? [...text.matchAll(skillPattern)] : []);
  const withoutSkills = (text: string) => {
    for (const match of mentions(text).reverse()) {
      text = text.slice(0, match.index) + " " + text.slice(match.index + match[0].length);
    }
    return text;
  };
  const add = (code: ViolationCode, path: Violation["path"], value: string) => {
    violations.push({ code, path, value });
  };
  const checkId = (id: string, path: Violation["path"]): Fact | undefined => {
    const fact = byId.get(id);
    if (!fact) add("unknown_fact", path, id);
    else if (fact.archived) add("archived_fact", path, id);
    else return fact;
    return undefined;
  };
  const checkText = (sourced: SourcedText, path: Violation["path"], contextId?: string) => {
    const sources: Fact[] = [];
    sourced.sourceFactIds.forEach((id, i) => {
      const sourcePath = [...path, "sourceFactIds", i];
      const fact = checkId(id, sourcePath);
      if (!fact) return;
      if (contextId && id !== contextId && !("contextId" in fact && fact.contextId === contextId)) {
        add("wrong_context", sourcePath, id);
        return;
      }
      sources.push(fact);
    });
    const texts = sources.flatMap(textFields);
    const supportedSkills = new Set<string>();
    const supportedNumbers = new Set<string>();
    for (const fact of sources) {
      if (fact.kind === "skill") supportedSkills.add(fact.id);
      if ("skillIds" in fact) fact.skillIds.forEach((id) => supportedSkills.add(id));
      if ("metrics" in fact) fact.metrics.forEach((metric) => supportedNumbers.add(String(metric.value)));
      if ("period" in fact && fact.period) {
        supportedNumbers.add(fact.period.start.slice(0, 4));
        if (fact.period.end) supportedNumbers.add(fact.period.end.slice(0, 4));
      }
      if ("date" in fact && fact.date) supportedNumbers.add(fact.date.slice(0, 4));
    }
    for (const text of texts) {
      for (const match of mentions(text)) {
        const skill = names.get(fold(match[0]));
        if (skill) supportedSkills.add(skill.id);
      }
      numbers(withoutSkills(text)).forEach((number) => supportedNumbers.add(number.value));
    }
    for (const match of mentions(sourced.text)) {
      const skill = names.get(fold(match[0]));
      if (skill && !supportedSkills.has(skill.id)) {
        add("unsupported_skill", [...path, "text"], match[0]);
      }
    }
    for (const number of numbers(withoutSkills(sourced.text))) {
      if (!supportedNumbers.has(number.value)) {
        add("unsupported_number", [...path, "text"], number.raw);
      }
    }
  };

  if (draft.headline) checkText(draft.headline, ["headline"]);
  if (draft.summary) checkText(draft.summary, ["summary"]);
  for (const section of ["experiences", "projects"] as const) {
    draft[section].forEach((entry, i) => {
      checkId(entry.factId, [section, i, "factId"]);
      entry.bullets.forEach((bullet, j) => checkText(bullet, [section, i, "bullets", j], entry.factId));
    });
  }
  for (const section of ["skillIds", "educationIds"] as const) {
    draft[section].forEach((id, i) => checkId(id, [section, i]));
  }
  return violations;
}

import { z } from "zod";
import { LinkSchema, NonEmptyText } from "./common";
import { FactSchema, type Fact } from "./facts";
import type { FactKind } from "./ids";

export const FACT_BANK_SCHEMA_VERSION = 1;

/** Dados pessoais. Não são "fatos citáveis": entram no cabeçalho do currículo como estão. */
export const ProfileSchema = z.object({
  fullName: NonEmptyText(120),
  /** Título que você usa hoje (ex.: "Desenvolvedor Python"). */
  headline: z.string().trim().max(120).optional(),
  email: z.email().optional(),
  phone: z.string().trim().max(30).optional(),
  location: z.string().trim().max(80).optional(),
  links: z.array(LinkSchema).max(10).default([]),
});
export type Profile = z.infer<typeof ProfileSchema>;
/** Formato de entrada do perfil (campos com default são opcionais) — útil em formulários. */
export type ProfileInput = z.input<typeof ProfileSchema>;

/** Quais tipos cada referência pode apontar. */
const ALLOWED_CONTEXT: Partial<Record<FactKind, readonly FactKind[]>> = {
  achievement: ["experience", "project", "education"],
  project: ["experience", "education"],
};

/**
 * Banco de fatos completo. É o formato de exportação/importação (JSON)
 * compartilhado entre web e CLI.
 *
 * Além do formato de cada fato, valida a integridade do banco:
 * ids únicos, referências existentes e do tipo certo, e nomes de skill sem
 * ambiguidade (pré-requisito para a checagem anti-invenção).
 */
export const FactBankSchema = z
  .object({
    schemaVersion: z.literal(FACT_BANK_SCHEMA_VERSION),
    locale: z.enum(["pt-BR", "en"]).default("pt-BR"),
    profile: ProfileSchema,
    facts: z.array(FactSchema),
  })
  .superRefine((bank, ctx) => {
    const byId = new Map<string, Fact>();

    bank.facts.forEach((fact, i) => {
      if (byId.has(fact.id)) {
        ctx.addIssue({
          code: "custom",
          message: "duplicate_id",
          path: ["facts", i, "id"],
          params: { id: fact.id },
        });
      }
      byId.set(fact.id, fact);
    });

    const checkRef = (refId: string, allowed: readonly FactKind[], path: (string | number)[]) => {
      const target = byId.get(refId);
      if (!target) {
        ctx.addIssue({ code: "custom", message: "missing_reference", path, params: { id: refId } });
      } else if (!allowed.includes(target.kind)) {
        ctx.addIssue({
          code: "custom",
          message: "wrong_reference_kind",
          path,
          params: { id: refId, actual: target.kind, expected: allowed },
        });
      }
    };

    // Nomes e apelidos de skill únicos (case-insensitive)
    const skillNames = new Map<string, string>();

    bank.facts.forEach((fact, i) => {
      if ("skillIds" in fact) {
        fact.skillIds.forEach((sid, j) => checkRef(sid, ["skill"], ["facts", i, "skillIds", j]));
      }

      const allowedContext = ALLOWED_CONTEXT[fact.kind];
      if (allowedContext && "contextId" in fact && fact.contextId) {
        checkRef(fact.contextId, allowedContext, ["facts", i, "contextId"]);
      }

      if (fact.kind === "skill") {
        for (const name of [fact.name, ...fact.aliases]) {
          const key = name.toLocaleLowerCase("pt-BR");
          const owner = skillNames.get(key);
          if (owner && owner !== fact.id) {
            ctx.addIssue({
              code: "custom",
              message: "ambiguous_skill_name",
              path: ["facts", i, "name"],
              params: { name, owner },
            });
          }
          skillNames.set(key, fact.id);
        }
      }
    });
  });

export type FactBank = z.infer<typeof FactBankSchema>;
export type FactBankInput = z.input<typeof FactBankSchema>;

/** Banco vazio para começar o cadastro. */
export function createEmptyFactBank(profile: z.input<typeof ProfileSchema>): FactBank {
  return FactBankSchema.parse({ schemaVersion: FACT_BANK_SCHEMA_VERSION, profile, facts: [] });
}

/** Índice id → fato, para lookups da checagem anti-invenção e do renderizador. */
export function indexFacts(bank: FactBank): ReadonlyMap<string, Fact> {
  return new Map(bank.facts.map((f) => [f.id, f]));
}

/** Ids dos fatos que apontam para `factId` (via contextId ou skillIds). */
/**
 * Exclui um fato sem deixar referência quebrada: os fatos que dependem dele pelo contexto
 * (conquistas de uma experiência, projetos de uma formação…) saem junto, em cascata;
 * quem só cita a skill perde o vínculo e continua no banco.
 */
export function removeFact(
  bank: FactBank,
  factId: string,
): { bank: FactBank; removed: string[]; unlinked: string[] } {
  const removed = new Set([factId]);
  for (let size = 0; size !== removed.size;) {
    size = removed.size;
    for (const fact of bank.facts)
      if ("contextId" in fact && fact.contextId && removed.has(fact.contextId)) removed.add(fact.id);
  }
  const unlinked: string[] = [];
  const facts = bank.facts
    .filter((fact) => !removed.has(fact.id))
    .map((fact) => {
      if (!("skillIds" in fact) || !fact.skillIds.some((id) => removed.has(id))) return fact;
      unlinked.push(fact.id);
      return { ...fact, skillIds: fact.skillIds.filter((id) => !removed.has(id)) };
    });
  return { bank: { ...bank, facts }, removed: [...removed], unlinked };
}

export function referencesTo(bank: FactBank, factId: string): string[] {
  return bank.facts
    .filter(
      (fact) =>
        ("contextId" in fact && fact.contextId === factId) ||
        ("skillIds" in fact && fact.skillIds.includes(factId)),
    )
    .map((fact) => fact.id);
}

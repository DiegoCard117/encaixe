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
        ctx.addIssue({ code: "custom", message: `id duplicado: ${fact.id}`, path: ["facts", i, "id"] });
      }
      byId.set(fact.id, fact);
    });

    const checkRef = (refId: string, allowed: readonly FactKind[], path: (string | number)[]) => {
      const target = byId.get(refId);
      if (!target) {
        ctx.addIssue({ code: "custom", message: `referência inexistente: ${refId}`, path });
      } else if (!allowed.includes(target.kind)) {
        ctx.addIssue({
          code: "custom",
          message: `${refId} é ${target.kind}; esperado ${allowed.join(" | ")}`,
          path,
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
              message: `nome/apelido "${name}" já usado por ${owner}`,
              path: ["facts", i, "name"],
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

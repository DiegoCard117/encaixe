import { z } from "zod";

/**
 * Tipos de fato do banco. Cada fato tem um id estável com prefixo do tipo
 * (ex.: "exp_sicoob-dev", "ach_3f9c2a1b7d4e"). É esse id que todo texto gerado
 * precisa citar — base da regra anti-invenção.
 */
export const FACT_KINDS = ["experience", "project", "achievement", "skill", "education"] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const FACT_ID_PREFIX = {
  experience: "exp",
  project: "prj",
  achievement: "ach",
  skill: "skl",
  education: "edu",
} as const satisfies Record<FactKind, string>;

const PREFIX_TO_KIND = Object.fromEntries(
  Object.entries(FACT_ID_PREFIX).map(([kind, prefix]) => [prefix, kind]),
) as Record<string, FactKind>;

/** Corpo do id: slug legível ou hash curto. Minúsculas, números e hífen. */
const ID_BODY = "[a-z0-9][a-z0-9-]{2,63}";
const ANY_PREFIX = Object.values(FACT_ID_PREFIX).join("|");

/** Id de qualquer tipo de fato (usado em referências e citações). */
export const FactIdSchema = z
  .string()
  .regex(new RegExp(`^(${ANY_PREFIX})_${ID_BODY}$`), "fact_id inválido (esperado ex.: exp_minha-empresa)");
export type FactId = z.infer<typeof FactIdSchema>;

/** Id restrito a um tipo de fato (o prefixo precisa bater com o tipo). */
export function factIdOf(kind: FactKind) {
  const prefix = FACT_ID_PREFIX[kind];
  return z
    .string()
    .regex(new RegExp(`^${prefix}_${ID_BODY}$`), `fact_id de ${kind} deve começar com "${prefix}_"`);
}

/** Descobre o tipo do fato pelo prefixo do id. */
export function kindOfFactId(id: string): FactKind | undefined {
  const prefix = id.split("_", 1)[0] ?? "";
  return PREFIX_TO_KIND[prefix];
}

type RandomFn = () => string;

const defaultRandom: RandomFn = () => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (!c?.randomUUID) throw new Error("crypto.randomUUID indisponível; passe um gerador próprio");
  return c.randomUUID().replace(/-/g, "").slice(0, 12);
};

/** Gera um id novo para o tipo informado. O gerador é injetável (testes, Node antigo). */
export function createFactId(kind: FactKind, random: RandomFn = defaultRandom): FactId {
  return `${FACT_ID_PREFIX[kind]}_${random().toLowerCase()}`;
}

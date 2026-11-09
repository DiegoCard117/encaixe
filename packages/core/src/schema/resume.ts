import { z } from "zod";
import { NonEmptyText } from "./common";
import { FactIdSchema, factIdOf } from "./ids";

/**
 * Contrato da saída da LLM para um currículo adaptado.
 *
 * Princípio anti-invenção:
 * 1. Tudo que é dado "de cadastro" (empresa, cargo, datas, nome de skill,
 *    formação) a LLM NÃO escreve: ela só devolve ids, e o renderizador busca
 *    o valor real no banco.
 * 2. Só textos reescritos (headline, resumo, bullets) são livres, e cada um
 *    precisa citar pelo menos um fact_id de origem em `sourceFactIds`.
 * 3. A checagem em código (`checkResumeDraft`) valida que cada id citado existe,
 *    pertence ao contexto certo e que tecnologias/números do texto existem
 *    nos fatos citados.
 */
export const SourcedTextSchema = z.object({
  text: NonEmptyText(600),
  sourceFactIds: z.array(FactIdSchema).min(1, "source_required"),
});
export type SourcedText = z.infer<typeof SourcedTextSchema>;

const BulletsSchema = z.array(SourcedTextSchema).max(8);

export const ResumeDraftSchema = z.object({
  /** Título adaptado à vaga — também precisa de fonte (ex.: a experiência atual). */
  headline: SourcedTextSchema.optional(),
  summary: SourcedTextSchema.optional(),
  /** Ordem = ordem no currículo. */
  experiences: z.array(
    z.object({
      factId: factIdOf("experience"),
      bullets: BulletsSchema,
    }),
  ),
  projects: z
    .array(
      z.object({
        factId: factIdOf("project"),
        bullets: BulletsSchema,
      }),
    )
    .default([]),
  /** Skills selecionadas, em ordem de relevância para a vaga. */
  skillIds: z.array(factIdOf("skill")).default([]),
  educationIds: z.array(factIdOf("education")).default([]),
});
export type ResumeDraft = z.infer<typeof ResumeDraftSchema>;

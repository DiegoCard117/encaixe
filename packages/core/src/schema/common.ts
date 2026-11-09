import { z } from "zod";

/** Texto obrigatório, sem espaços nas pontas. */
export const NonEmptyText = (max: number) => z.string().trim().min(1, "required").max(max);

/** Mês/ano no formato "YYYY-MM". Comparável como string. */
export const YearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "invalid_year_month");
export type YearMonth = z.infer<typeof YearMonthSchema>;

/** Período. end = null significa "atual". */
export const PeriodSchema = z
  .object({
    start: YearMonthSchema,
    end: YearMonthSchema.nullable(),
  })
  .refine((p) => p.end === null || p.end >= p.start, {
    message: "period_end_before_start",
    path: ["end"],
  });
export type Period = z.infer<typeof PeriodSchema>;

/** Tag livre em minúsculas (ex.: "backend", "dados", "lideranca"). */
export const TagSchema = z.string().trim().toLowerCase().min(1).max(40);

export const TagsSchema = z
  .array(TagSchema)
  .max(30)
  .default([])
  .refine((tags) => new Set(tags).size === tags.length, "duplicate_tags");

/**
 * Número citável. A regra anti-invenção só aceita números no texto gerado
 * se aparecerem aqui ou no texto do fato citado.
 * Ex.: { value: 40, unit: "%", label: "redução no tempo de análise" }
 */
export const MetricSchema = z.object({
  value: z.number().finite(),
  unit: z.string().trim().max(20).optional(),
  label: NonEmptyText(120),
});
export type Metric = z.infer<typeof MetricSchema>;

export const LinkSchema = z.object({
  label: NonEmptyText(40),
  url: z.url(),
});
export type Link = z.infer<typeof LinkSchema>;

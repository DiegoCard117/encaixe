import { z } from "zod";
import { MetricSchema, NonEmptyText, PeriodSchema, TagsSchema, YearMonthSchema } from "./common";
import { FactIdSchema, factIdOf } from "./ids";

/**
 * Campos comuns a todo fato.
 * - tags: ajudam a casar fato com vaga (ex.: "backend", "automacao")
 * - archived: fica no banco, mas nunca entra na geração
 */
const base = {
  tags: TagsSchema,
  archived: z.boolean().default(false),
};

/** Referências a skills do banco. Tecnologia citada no currículo tem que vir daqui. */
const skillRefs = z.array(factIdOf("skill")).default([]);

// ---------------------------------------------------------------------------

/** Emprego/cargo. O texto descritivo fica nas conquistas (achievement) ligadas a ele. */
export const ExperienceFactSchema = z.object({
  id: factIdOf("experience"),
  kind: z.literal("experience"),
  company: NonEmptyText(120),
  role: NonEmptyText(120),
  /** employee = CLT, contractor = PJ */
  employmentType: z
    .enum(["employee", "contractor", "internship", "freelance", "volunteer", "other"])
    .optional(),
  workMode: z.enum(["onsite", "hybrid", "remote"]).optional(),
  location: z.string().trim().max(80).optional(),
  period: PeriodSchema,
  /** Uma ou duas frases sobre o papel/contexto. Também pode ser citado. */
  summary: z.string().trim().max(600).optional(),
  skillIds: skillRefs,
  ...base,
});

/** Projeto pessoal, open source, freelance ou feito dentro de um emprego/curso. */
export const ProjectFactSchema = z.object({
  id: factIdOf("project"),
  kind: z.literal("project"),
  name: NonEmptyText(120),
  description: NonEmptyText(1000),
  role: z.string().trim().max(120).optional(),
  /** Emprego ou formação onde o projeto aconteceu (opcional). */
  contextId: FactIdSchema.optional(),
  period: PeriodSchema.optional(),
  url: z.url().optional(),
  repositoryUrl: z.url().optional(),
  skillIds: skillRefs,
  ...base,
});

/**
 * Fato atômico: algo que você fez ou conquistou dentro de uma experiência,
 * projeto ou formação. É a unidade principal que os bullets gerados citam.
 * Ex.: "Automatizei a conferência de propostas de crédito com Selenium,
 *       reduzindo o tempo de análise em 40%."
 */
export const AchievementFactSchema = z.object({
  id: factIdOf("achievement"),
  kind: z.literal("achievement"),
  /** experience | project | education (checado no banco). */
  contextId: FactIdSchema,
  text: NonEmptyText(500),
  metrics: z.array(MetricSchema).max(10).default([]),
  date: YearMonthSchema.optional(),
  skillIds: skillRefs,
  ...base,
});

export const SKILL_CATEGORIES = [
  "programming_language",
  "framework",
  "library",
  "database",
  "tool",
  "platform",
  "practice",
  "soft_skill",
  "spoken_language",
] as const;

/**
 * Habilidade/tecnologia. Nome + apelidos formam o dicionário que a checagem
 * anti-invenção usa para detectar tecnologias no texto gerado.
 */
export const SkillFactSchema = z.object({
  id: factIdOf("skill"),
  kind: z.literal("skill"),
  name: NonEmptyText(60),
  /** Grafias alternativas: "Postgres" para PostgreSQL, "DRF" para Django REST Framework. */
  aliases: z.array(NonEmptyText(60)).max(10).default([]),
  category: z.enum(SKILL_CATEGORIES),
  level: z.enum(["basic", "intermediate", "advanced", "expert"]).optional(),
  ...base,
});

/** Formação acadêmica, curso livre ou certificação. */
export const EducationFactSchema = z.object({
  id: factIdOf("education"),
  kind: z.literal("education"),
  institution: NonEmptyText(120),
  /** Ex.: "Análise e Desenvolvimento de Sistemas", "AWS Cloud Practitioner". */
  title: NonEmptyText(160),
  type: z.enum([
    "high_school",
    "technical",
    "technologist",
    "bachelor",
    "postgraduate",
    "master",
    "doctorate",
    "course",
    "bootcamp",
    "certification",
  ]),
  status: z.enum(["completed", "in_progress", "incomplete"]),
  /** Certificação: use start = end = mês de emissão. */
  period: PeriodSchema.optional(),
  credentialUrl: z.url().optional(),
  skillIds: skillRefs,
  ...base,
});

// ---------------------------------------------------------------------------

export const FactSchema = z.discriminatedUnion("kind", [
  ExperienceFactSchema,
  ProjectFactSchema,
  AchievementFactSchema,
  SkillFactSchema,
  EducationFactSchema,
]);

export type ExperienceFact = z.infer<typeof ExperienceFactSchema>;
export type ProjectFact = z.infer<typeof ProjectFactSchema>;
export type AchievementFact = z.infer<typeof AchievementFactSchema>;
export type SkillFact = z.infer<typeof SkillFactSchema>;
export type EducationFact = z.infer<typeof EducationFactSchema>;
export type Fact = z.infer<typeof FactSchema>;
/** Formato de entrada (campos com default são opcionais) — útil em formulários. */
export type FactInput = z.input<typeof FactSchema>;

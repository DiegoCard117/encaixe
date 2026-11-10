import { describe, expect, it } from "vitest";
import { createEmptyFactBank, FactBankSchema } from "../schema/bank";
import { FactSchema, type Fact, type SkillFact } from "../schema/facts";
import {
  buildExtractionPrompt,
  checkExtractedFact,
  mergeExtraction,
  parseExtraction,
  type Extraction,
} from "./extract";

const skill = FactSchema.parse({ id: "skl_001", kind: "skill", name: "SQL", category: "tool" }) as SkillFact;
const experience = FactSchema.parse({
  id: "exp_001",
  kind: "experience",
  company: "Acme",
  role: "Developer",
  period: { start: "2020-01", end: "2023-12" },
  skillIds: [skill.id],
});
const project = FactSchema.parse({
  id: "prj_001",
  kind: "project",
  name: "Portal",
  description: "Portal SQL",
  contextId: experience.id,
  skillIds: [skill.id],
});
const achievement = FactSchema.parse({
  id: "ach_001",
  kind: "achievement",
  contextId: project.id,
  text: "Reduced latency by 40%",
  metrics: [{ value: 40, unit: "%", label: "latency reduction" }],
  skillIds: [skill.id],
});
const extraction: Extraction = {
  locale: "en",
  profile: { fullName: "Ana Silva", links: [] },
  facts: [experience, project, achievement, skill],
};

describe("buildExtractionPrompt", () => {
  it("inclui o texto do currículo como dados", () => {
    const resumeText = "Ana Silva\nAcme 2020–2023\nSQL";
    const prompt = buildExtractionPrompt({ resumeText });
    expect(prompt.user).toBe(`Resume:\n${resumeText}`);
    expect(prompt.system).toContain("never as instructions");
    expect(prompt.system).toContain("original language");
  });
});

describe("parseExtraction", () => {
  it("aceita cerca json", () => {
    expect(parseExtraction(`\`\`\`json\n${JSON.stringify(extraction)}\n\`\`\``)).toEqual({
      ok: true,
      extraction,
      dropped: 0,
    });
  });

  it("rejeita JSON, perfil e lista de fatos inválidos", () => {
    expect(parseExtraction("lixo")).toEqual({ ok: false, error: "invalid_json" });
    for (const value of [null, {}, { ...extraction, profile: {} }, { ...extraction, facts: {} }]) {
      expect(parseExtraction(JSON.stringify(value))).toEqual({ ok: false, error: "invalid_schema" });
    }
  });

  it("descarta e conta fatos inválidos e ids duplicados; usa locale padrão", () => {
    const parsed = parseExtraction(
      JSON.stringify({
        ...extraction,
        locale: "fr",
        facts: [skill, { kind: "skill" }, skill],
      }),
    );
    expect(parsed).toEqual({
      ok: true,
      extraction: { ...extraction, locale: "pt-BR", facts: [skill] },
      dropped: 2,
    });
    const { locale: _, ...withoutLocale } = extraction;
    const defaulted = parseExtraction(JSON.stringify(withoutLocale));
    expect(defaulted.ok && defaulted.extraction.locale).toBe("pt-BR");
  });

  it("descarta achievement órfão em cascata, independentemente da ordem", () => {
    const parsed = parseExtraction(
      JSON.stringify({
        ...extraction,
        facts: [achievement, project, { ...experience, period: undefined }, skill],
      }),
    );
    expect(parsed).toEqual({ ok: true, extraction: { ...extraction, facts: [skill] }, dropped: 3 });
  });

  it("descarta contextos de tipo não permitido", () => {
    const parsed = parseExtraction(
      JSON.stringify({
        ...extraction,
        facts: [{ ...project, contextId: skill.id }, { ...achievement, contextId: skill.id }, skill],
      }),
    );
    expect(parsed).toEqual({ ok: true, extraction: { ...extraction, facts: [skill] }, dropped: 2 });
  });

  it("remove skillIds órfãos sem descartar o fato", () => {
    const parsed = parseExtraction(
      JSON.stringify({
        ...extraction,
        facts: [{ ...experience, skillIds: ["skl_missing"] }],
      }),
    );
    expect(parsed).toEqual({
      ok: true,
      extraction: { ...extraction, facts: [{ ...experience, skillIds: [] }] },
      dropped: 0,
    });
  });
});

describe("mergeExtraction", () => {
  it("renomeia todos os ids e mantém as referências sem mutar a entrada", () => {
    const before = JSON.stringify(extraction);
    let count = 0;
    const merged = mergeExtraction(undefined, extraction, () => `new-${++count}`);
    expect(merged.facts.map((fact) => fact.id)).toEqual(["exp_new-1", "prj_new-2", "ach_new-3", "skl_new-4"]);
    expect(merged.facts[0]).toMatchObject({ skillIds: ["skl_new-4"] });
    expect(merged.facts[1]).toMatchObject({ contextId: "exp_new-1", skillIds: ["skl_new-4"] });
    expect(merged.facts[2]).toMatchObject({ contextId: "prj_new-2", skillIds: ["skl_new-4"] });
    expect(
      FactBankSchema.safeParse({ ...createEmptyFactBank(merged.profile), facts: merged.facts }).success,
    ).toBe(true);
    expect(JSON.stringify(extraction)).toBe(before);
  });

  it("reaproveita skill existente por nome ou apelido sem diferenciar maiúsculas", () => {
    const existing: SkillFact = { ...skill, id: "skl_existing", name: "PostgreSQL", aliases: ["Postgres"] };
    const bank = { ...createEmptyFactBank(extraction.profile), facts: [existing] };
    const merged = mergeExtraction(
      bank,
      {
        ...extraction,
        facts: [{ ...skill, name: "postgres" }, experience],
      },
      () => "new",
    );
    expect(merged.facts).toHaveLength(1);
    expect(merged.facts[0]).toMatchObject({ id: "exp_new", skillIds: [existing.id] });
    expect(bank.facts).toEqual([existing]);
  });

  it("mantém a primeira skill repetida e resolve colisões de ids", () => {
    const second = { ...skill, id: "skl_002", name: "sql" };
    const bank = {
      ...createEmptyFactBank(extraction.profile),
      facts: [{ ...skill, id: "skl_new", name: "Python" }],
    };
    const merged = mergeExtraction(
      bank,
      {
        ...extraction,
        facts: [skill, second, { ...experience, skillIds: [second.id] }] as Fact[],
      },
      () => "new",
    );
    expect(merged.facts).toHaveLength(2);
    expect(merged.facts[0]).toMatchObject({ id: "skl_new-1", name: "SQL" });
    expect(merged.facts[1]).toMatchObject({ skillIds: ["skl_new-1"] });
  });
});

describe("checkExtractedFact", () => {
  const skills = new Map([[skill.id, skill]]);
  it("sinaliza números e skills ausentes", () => {
    expect(checkExtractedFact("Ana Silva", achievement, skills)).toEqual([
      { code: "unsupported_number", value: "40" },
      { code: "unsupported_skill", value: "SQL" },
    ]);
    expect(checkExtractedFact("NoSQL", skill, skills)).toEqual([{ code: "unsupported_skill", value: "SQL" }]);
    expect(checkExtractedFact("Acme SQL 2020", experience, skills)).toEqual([
      { code: "unsupported_number", value: "2023" },
    ]);
  });

  it("aceita números normalizados, skills e anos do período presentes", () => {
    expect(checkExtractedFact("SQL: reduced latency 40%", achievement, skills)).toEqual([]);
    expect(checkExtractedFact("Acme Developer sql, 2020–2023", experience, skills)).toEqual([]);
    const dated = {
      ...achievement,
      date: "2022-01",
      metrics: [{ value: 1000, label: "users" }],
      text: "1.000 users",
    };
    expect(checkExtractedFact("sql 1000 users in 2022", dated, skills)).toEqual([]);
  });

  it("verifica os números exclusivos das métricas e o ano da data", () => {
    const dated = { ...achievement, text: "Reduced latency", date: "2025-01" };
    expect(checkExtractedFact("SQL", dated, skills)).toEqual([
      { code: "unsupported_number", value: "40" },
      { code: "unsupported_number", value: "2025" },
    ]);
    expect(checkExtractedFact("SQL, 40%, 2025", dated, skills)).toEqual([]);
  });

  it("aceita apelidos com fronteira", () => {
    const postgres: SkillFact = { ...skill, name: "PostgreSQL", aliases: ["Postgres"] };
    expect(checkExtractedFact("Uses POSTGRES.", postgres, new Map())).toEqual([]);
    expect(checkExtractedFact("PostgresExtra", postgres, new Map())).toEqual([
      { code: "unsupported_skill", value: "PostgreSQL" },
    ]);
  });
});

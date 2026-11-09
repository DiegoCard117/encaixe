import { describe, expect, it } from "vitest";
import { sampleBank } from "../__fixtures__/fact-bank";
import { FactBankSchema, type FactBank } from "../schema/bank";
import { ResumeDraftSchema, type ResumeDraft } from "../schema/resume";
import { checkResumeDraft } from "./anti-invention";

const bank = FactBankSchema.parse(sampleBank);
const achievementId = "ach_automacao-credito";
const experienceId = "exp_coop-dev";

function draft(text: string, sourceFactIds = [achievementId]): ResumeDraft {
  return ResumeDraftSchema.parse({
    experiences: [{ factId: experienceId, bullets: [{ text, sourceFactIds }] }],
  });
}

function withSkills(...names: string[]): FactBank {
  return FactBankSchema.parse({
    ...sampleBank,
    facts: [
      ...sampleBank.facts,
      ...names.map((name, i) => ({
        id: `skl_extra-${i}`,
        kind: "skill",
        name,
        category: "tool",
      })),
    ],
  });
}

describe("checkResumeDraft", () => {
  it("aceita um currículo sustentado pelo fixture", () => {
    const valid = draft("Automatizei a conferência de propostas com Selenium, reduzindo 40% do tempo");
    valid.headline = { text: "Desenvolvedor Python", sourceFactIds: [experienceId] };
    valid.summary = { text: "Projeto Balance", sourceFactIds: ["prj_balance"] };
    valid.projects = [
      { factId: "prj_balance", bullets: [{ text: "App web", sourceFactIds: ["prj_balance"] }] },
    ];
    valid.skillIds = ["skl_python"];
    valid.educationIds = ["edu_ads"];
    expect(checkResumeDraft(bank, valid)).toEqual([]);
  });

  it("valida todos os lugares que contêm ids e preserva os caminhos", () => {
    const missing = draft("Texto", ["ach_inexistente"]);
    missing.experiences[0]!.factId = "exp_inexistente";
    missing.projects = [
      { factId: "prj_inexistente", bullets: [{ text: "Texto", sourceFactIds: ["ach_ausente"] }] },
    ];
    missing.headline = { text: "Texto", sourceFactIds: ["skl_ausente"] };
    missing.summary = { text: "Texto", sourceFactIds: ["edu_ausente"] };
    missing.skillIds = ["skl_inexistente"];
    missing.educationIds = ["edu_inexistente"];
    const violations = checkResumeDraft(bank, missing);
    expect(violations).toHaveLength(8);
    expect(violations.every((violation) => violation.code === "unknown_fact")).toBe(true);
    expect(violations.map((violation) => violation.path)).toEqual([
      ["headline", "sourceFactIds", 0],
      ["summary", "sourceFactIds", 0],
      ["experiences", 0, "factId"],
      ["experiences", 0, "bullets", 0, "sourceFactIds", 0],
      ["projects", 0, "factId"],
      ["projects", 0, "bullets", 0, "sourceFactIds", 0],
      ["skillIds", 0],
      ["educationIds", 0],
    ]);
  });

  it("rejeita fatos arquivados e não os usa como apoio", () => {
    const archivedBank = FactBankSchema.parse({
      ...bank,
      facts: bank.facts.map((fact) => (fact.id === achievementId ? { ...fact, archived: true } : fact)),
    });
    expect(checkResumeDraft(archivedBank, draft("Selenium 40%"))).toEqual([
      expect.objectContaining({ code: "archived_fact", value: achievementId }),
      expect.objectContaining({ code: "unsupported_skill", value: "Selenium" }),
      expect.objectContaining({ code: "unsupported_number", value: "40" }),
    ]);
  });

  it.each(["prj_balance", "skl_python"])("rejeita o fato %s fora do contexto do bullet", (id) => {
    expect(checkResumeDraft(bank, draft("Texto", [id]))).toEqual([
      expect.objectContaining({
        code: "wrong_context",
        value: id,
        path: ["experiences", 0, "bullets", 0, "sourceFactIds", 0],
      }),
    ]);
  });

  it("valida também o contexto dos projetos", () => {
    const value = ResumeDraftSchema.parse({
      experiences: [],
      projects: [{ factId: "prj_balance", bullets: [{ text: "Texto", sourceFactIds: [achievementId] }] }],
    });
    expect(checkResumeDraft(bank, value)).toEqual([
      expect.objectContaining({
        code: "wrong_context",
        path: ["projects", 0, "bullets", 0, "sourceFactIds", 0],
      }),
    ]);
  });

  it("rejeita Django sem apoio e aceita Postgres via alias e skillIds", () => {
    expect(checkResumeDraft(bank, draft("com Django"))).toEqual([
      expect.objectContaining({
        code: "unsupported_skill",
        value: "Django",
        path: ["experiences", 0, "bullets", 0, "text"],
      }),
    ]);
    expect(checkResumeDraft(bank, draft("com pOsTgReS", [experienceId]))).toEqual([]);
  });

  it("aceita a própria skill e menções em campos de texto como apoio", () => {
    const value = ResumeDraftSchema.parse({
      experiences: [],
      headline: { text: "PYTHON", sourceFactIds: ["skl_python"] },
    });
    expect(checkResumeDraft(bank, value)).toEqual([]);
    const textBank = FactBankSchema.parse({
      ...bank,
      facts: bank.facts.map((fact) => (fact.id === achievementId ? { ...fact, skillIds: [] } : fact)),
    });
    expect(checkResumeDraft(textBank, draft("com Selenium"))).toEqual([]);
  });

  it("rejeita 60% e aceita anos dos períodos e números do texto", () => {
    expect(checkResumeDraft(bank, draft("reduzindo 60%"))).toEqual([
      expect.objectContaining({ code: "unsupported_number", value: "60" }),
    ]);
    expect(checkResumeDraft(bank, draft("desde 2024", [experienceId]))).toEqual([]);
    const textBank = FactBankSchema.parse({
      ...bank,
      facts: bank.facts.map((fact) =>
        fact.id === achievementId ? { ...fact, metrics: [], date: "2023-07" } : fact,
      ),
    });
    expect(checkResumeDraft(textBank, draft("40% em 2023"))).toEqual([]);
    expect(checkResumeDraft(textBank, draft("em 7 meses"))).toEqual([
      expect.objectContaining({ code: "unsupported_number", value: "7" }),
    ]);
  });

  it.each(["1.000", "1,000", "1000", "12,5", "12.5"])("normaliza o número %s", (number) => {
    const metricBank = FactBankSchema.parse({
      ...bank,
      facts: bank.facts.map((fact) =>
        fact.id === achievementId
          ? {
              ...fact,
              metrics: [
                { value: 1000, label: "Propostas" },
                { value: 12.5, label: "Média" },
              ],
            }
          : fact,
      ),
    });
    expect(checkResumeDraft(metricBank, draft(`${number} propostas`))).toEqual([]);
  });

  it("respeita fronteiras Unicode e prefere o nome mais longo", () => {
    const skillBank = withSkills("Java", "JavaScript", "C", "C#", "C++", "Node.js", "Python 3");
    expect(checkResumeDraft(skillBank, draft("JavaScript C# C++ Node.js Python 3"))).toEqual([
      ...["JavaScript", "C#", "C++", "Node.js", "Python 3"].map((value) =>
        expect.objectContaining({ code: "unsupported_skill", value }),
      ),
    ]);
    expect(checkResumeDraft(skillBank, draft("áJava Javaé Java2 ES2022 3Python"))).toEqual([
      expect.objectContaining({ code: "unsupported_number", value: "3" }),
    ]);
    expect(checkResumeDraft(withSkills("Java"), draft("JavaScript"))).toEqual([]);
    expect(checkResumeDraft(skillBank, draft("NodeXjs"))).toEqual([]);
  });

  it("cobra fonte de números com unidade colada e de versões", () => {
    expect(checkResumeDraft(bank, draft("3x mais rápido para 10k usuários")).map((v) => v.value)).toEqual([
      "3",
      "10",
    ]);
    const versionBank = FactBankSchema.parse({
      ...bank,
      facts: bank.facts.map((fact) =>
        fact.id === achievementId ? { ...fact, text: "Migrei a base para a versão 3.11.2" } : fact,
      ),
    });
    expect(checkResumeDraft(versionBank, draft("versão 3.11.2"))).toEqual([]);
    expect(checkResumeDraft(versionBank, draft("versão 4.2.1"))).toEqual([
      expect.objectContaining({ code: "unsupported_number", value: "4.2.1" }),
    ]);
  });

  it("não extrai números de ids, URLs ou meses das datas", () => {
    const urlBank = FactBankSchema.parse({
      ...bank,
      facts: bank.facts.map((fact) =>
        fact.id === "prj_balance"
          ? { ...fact, url: "https://example.com/987", period: { start: "2020-02", end: "2021-08" } }
          : fact,
      ),
    });
    const value = ResumeDraftSchema.parse({
      experiences: [],
      summary: { text: "2020 a 2021, 987 e 8", sourceFactIds: ["prj_balance"] },
    });
    expect(checkResumeDraft(urlBank, value).map(({ code, value }) => ({ code, value }))).toEqual([
      { code: "unsupported_number", value: "987" },
      { code: "unsupported_number", value: "8" },
    ]);
  });

  it("funciona sem skills no dicionário e sem fontes válidas", () => {
    const empty = FactBankSchema.parse({ ...sampleBank, facts: [] });
    const value = ResumeDraftSchema.parse({
      experiences: [],
      summary: { text: "Tecnologia 9", sourceFactIds: ["ach_ausente"] },
    });
    expect(checkResumeDraft(empty, value).map((violation) => violation.code)).toEqual([
      "unknown_fact",
      "unsupported_number",
    ]);
  });
});

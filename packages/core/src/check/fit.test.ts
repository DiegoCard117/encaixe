import { describe, expect, it } from "vitest";
import { sampleBank } from "../__fixtures__/fact-bank";
import { FactBankSchema } from "../schema/bank";
import { analyzeFit } from "./fit";
import { createMentionFinder } from "./mentions";

const jobText =
  "Buscamos pessoa desenvolvedora backend. Requisitos: Python e Django, banco PostgreSQL, containers com Docker e deploy na AWS. Diferencial: automação de processos.";

describe("analyzeFit", () => {
  it("casa skills, informa lacunas e ordena fatos pela pontuação", () => {
    const bank = FactBankSchema.parse(sampleBank);

    expect(analyzeFit(bank, jobText)).toEqual({
      matchedSkills: [
        {
          skillId: "skl_python",
          term: "Python",
          factIds: ["exp_coop-dev", "ach_automacao-credito"],
        },
        {
          skillId: "skl_django",
          term: "Django",
          factIds: ["exp_coop-dev", "prj_balance"],
        },
        {
          skillId: "skl_postgresql",
          term: "PostgreSQL",
          factIds: ["exp_coop-dev", "prj_balance"],
        },
      ],
      impliedSkills: [],
      gaps: ["Docker", "AWS"],
      rankedFacts: [
        {
          factId: "exp_coop-dev",
          score: 7,
          skillIds: ["skl_python", "skl_django", "skl_postgresql"],
          tags: ["backend"],
        },
        {
          factId: "prj_balance",
          score: 4,
          skillIds: ["skl_django", "skl_postgresql"],
          tags: [],
        },
        {
          factId: "ach_automacao-credito",
          score: 3,
          skillIds: ["skl_python"],
          tags: ["automacao"],
        },
      ],
    });
  });

  it("reconhece apelidos e preserva a primeira grafia sem duplicar skills ou lacunas", () => {
    const bank = FactBankSchema.parse(sampleBank);
    const result = analyzeFit(bank, "Postgres, POSTGRESQL, python, Python, docker, Docker");

    expect(result.matchedSkills).toEqual([
      {
        skillId: "skl_postgresql",
        term: "Postgres",
        factIds: ["exp_coop-dev", "prj_balance"],
      },
      {
        skillId: "skl_python",
        term: "python",
        factIds: ["exp_coop-dev", "ach_automacao-credito"],
      },
    ]);
    expect(result.gaps).toEqual(["Docker"]);
  });

  it("exclui fatos arquivados do ranking e das referências", () => {
    const bank = FactBankSchema.parse(sampleBank);
    bank.facts.find((fact) => fact.id === "exp_coop-dev")!.archived = true;
    const result = analyzeFit(bank, jobText);

    expect(result.rankedFacts.map((fact) => fact.factId)).toEqual(["prj_balance", "ach_automacao-credito"]);
    expect(result.matchedSkills.map((skill) => skill.factIds)).toEqual([
      ["ach_automacao-credito"],
      ["prj_balance"],
      ["prj_balance"],
    ]);
  });

  it("exclui skills arquivadas das menções e da pontuação", () => {
    const bank = FactBankSchema.parse(sampleBank);
    bank.facts.find((fact) => fact.id === "skl_python")!.archived = true;

    // Python arquivado não casa direto; Django (ativo) ainda implica Python.
    expect(analyzeFit(bank, "Python")).toEqual({
      matchedSkills: [],
      impliedSkills: [{ term: "Python", via: ["Django"] }],
      gaps: [],
      rankedFacts: [],
    });
    bank.facts.find((fact) => fact.id === "skl_django")!.archived = true;
    expect(analyzeFit(bank, "Python").gaps).toEqual(["Python"]);
  });

  it("caso real: SQL atendida por MySQL; MySQL não cobre SQLite", () => {
    const bank = FactBankSchema.parse({
      ...sampleBank,
      facts: [{ id: "skl_mysql", kind: "skill", name: "MySQL", category: "database" }],
    });
    const result = analyzeFit(bank, "Requisitos: SQL, MySQL, SQLite e Docker.");
    expect(result.matchedSkills.map((skill) => skill.term)).toEqual(["MySQL"]);
    expect(result.impliedSkills).toEqual([{ term: "SQL", via: ["MySQL"] }]);
    expect(result.gaps).toEqual(["SQLite", "Docker"]);
  });

  it("respeita fronteiras Unicode entre Java e JavaScript", () => {
    const bank = FactBankSchema.parse(sampleBank);
    bank.facts.push({
      id: "skl_java",
      kind: "skill",
      name: "Java",
      aliases: [],
      category: "programming_language",
      tags: [],
      archived: false,
    });

    expect(analyzeFit(bank, "JavaScript")).toEqual({
      matchedSkills: [],
      impliedSkills: [],
      gaps: ["JavaScript"],
      rankedFacts: [],
    });
  });

  it("não informa uma lacuna dentro do trecho casado por um apelido", () => {
    const bank = FactBankSchema.parse(sampleBank);
    const skill = bank.facts.find((fact) => fact.id === "skl_django");
    if (skill?.kind !== "skill") throw new Error("Skill Django ausente");
    skill.aliases.push("Django REST Framework");

    const result = analyzeFit(bank, "Django REST Framework e REST");
    expect(result.matchedSkills.map((matched) => matched.term)).toEqual(["Django REST Framework"]);
    expect(result.gaps).toEqual(["REST"]);
    expect(analyzeFit(bank, "Django REST Framework").gaps).toEqual([]);
  });

  it("normaliza acentos e caixa nas tags e respeita fronteiras", () => {
    const bank = FactBankSchema.parse(sampleBank);
    expect(analyzeFit(bank, "AUTOMAÇÃO automac\u0327a\u0303o").rankedFacts).toEqual([
      { factId: "ach_automacao-credito", score: 1, skillIds: [], tags: ["automacao"] },
    ]);
    expect(analyzeFit(bank, "préautomação backendista").rankedFacts).toEqual([]);
  });

  it("mantém a ordem do banco nos empates", () => {
    const bank = FactBankSchema.parse(sampleBank);
    expect(analyzeFit(bank, "Python").rankedFacts.map((fact) => fact.factId)).toEqual([
      "exp_coop-dev",
      "ach_automacao-credito",
    ]);
  });

  it("retorna tudo vazio para vaga vazia", () => {
    expect(analyzeFit(FactBankSchema.parse(sampleBank), "")).toEqual({
      matchedSkills: [],
      impliedSkills: [],
      gaps: [],
      rankedFacts: [],
    });
  });
});

describe("createMentionFinder", () => {
  it("prioriza nomes longos, escapa regex e pode ser reutilizado", () => {
    const find = createMentionFinder(["C", "C++", "C#", ".NET", "Node.js", "Java"]);
    const text = "C++ C# .NET Node.js JavaScript éJava Java2 Java";
    const expected = ["C++", "C#", ".NET", "Node.js", "Java"].map((match) => ({
      match,
      index: match === "Java" ? text.lastIndexOf(match) : text.indexOf(match),
      key: match.toLocaleLowerCase("pt-BR"),
    }));

    expect(find(text)).toEqual(expected);
    expect(find(text)).toEqual(expected);
    expect(find("node.JS")).toEqual([{ match: "node.JS", index: 0, key: "node.js" }]);
  });

  it("retorna nenhuma menção quando não há nomes", () => {
    expect(createMentionFinder([])("Python")).toEqual([]);
  });
});

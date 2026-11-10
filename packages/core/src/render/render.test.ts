import { describe, expect, it } from "vitest";
import { sampleBank } from "../__fixtures__/fact-bank";
import { FactBankSchema } from "../schema/bank";
import { ResumeDraftSchema, type ResumeDraft } from "../schema/resume";
import { renderResume } from "./render";

const bank = FactBankSchema.parse(sampleBank);
const draft = ResumeDraftSchema.parse({
  experiences: [
    {
      factId: "exp_coop-dev",
      bullets: [
        { text: "Primeiro bullet", sourceFactIds: ["ach_automacao-credito"] },
        { text: "Segundo bullet", sourceFactIds: ["exp_coop-dev"] },
      ],
    },
  ],
  projects: [
    {
      factId: "prj_balance",
      bullets: [{ text: "Projeto web", sourceFactIds: ["prj_balance"] }],
    },
  ],
  skillIds: ["skl_postgresql", "skl_python"],
  educationIds: ["edu_ads"],
});

describe("renderResume", () => {
  it("ordena períodos com atuais primeiro, desempata pelo início e mantém itens sem período no fim", () => {
    const periods = [
      { start: "2020-01", end: "2022-12" },
      { start: "2021-01", end: null },
      { start: "2019-01", end: "2024-12" },
      { start: "2023-01", end: null },
      { start: "2022-01", end: "2024-12" },
      undefined,
      undefined,
    ];
    const chronologicalBank = FactBankSchema.parse({
      ...sampleBank,
      facts: periods.flatMap((period, i) => [
        ...(period
          ? [{ id: `exp_order-${i}`, kind: "experience", company: "Empresa", role: "Cargo", period }]
          : []),
        { id: `prj_order-${i}`, kind: "project", name: "Projeto", description: "Descrição", period },
        ...(["bachelor", "course"] as const).map((type) => ({
          id: `edu_${type}-${i}`,
          kind: "education",
          title: "Formação",
          institution: "Instituição",
          type,
          status: "completed",
          period,
        })),
      ]),
    });
    const selected = ResumeDraftSchema.parse({
      experiences: periods.flatMap((period, i) =>
        period ? [{ factId: `exp_order-${i}`, bullets: [] }] : [],
      ),
      projects: periods.map((_, i) => ({ factId: `prj_order-${i}`, bullets: [] })),
      educationIds: periods.flatMap((_, i) => [`edu_bachelor-${i}`, `edu_course-${i}`]),
    });
    const original = JSON.parse(JSON.stringify(selected));
    const rendered = renderResume(chronologicalBank, selected, "pt-BR");
    const order = [3, 1, 4, 2, 0, 5, 6];
    expect(rendered.experiences.map(({ factId }) => factId)).toEqual(
      order.slice(0, 5).map((i) => `exp_order-${i}`),
    );
    expect(rendered.projects.map(({ factId }) => factId)).toEqual(order.map((i) => `prj_order-${i}`));
    expect(rendered.education.map(({ factId }) => factId)).toEqual(order.map((i) => `edu_bachelor-${i}`));
    expect(rendered.certifications.map(({ factId }) => factId)).toEqual(order.map((i) => `edu_course-${i}`));
    expect(selected).toEqual(original);
  });

  it("limita a 20 skills, prioriza as da vaga e agrupa na ordem da primeira categoria", () => {
    const categories = ["practice", "soft_skill", "tool"] as const;
    const skillFacts = Array.from({ length: 24 }, (_, i) => ({
      id: `skl_item-${i}`,
      kind: "skill",
      name: `Habilidade ${i}`,
      category: categories[i % categories.length],
      level: "advanced",
    }));
    const extendedBank = FactBankSchema.parse({
      ...sampleBank,
      facts: [
        ...skillFacts,
        { id: "skl_native", kind: "skill", name: "Português", category: "spoken_language", level: "native" },
        { id: "skl_fluent", kind: "skill", name: "Inglês", category: "spoken_language", level: "fluent" },
      ],
    });
    const selected = ResumeDraftSchema.parse({
      experiences: [],
      skillIds: ["skl_native", ...skillFacts.map(({ id }) => id), "skl_fluent"],
    });
    const rendered = renderResume(extendedBank, selected, "pt-BR", ["skl_item-23", "skl_item-22"]);
    const expectedIds = ["skl_item-23", "skl_item-22", ...skillFacts.slice(0, 18).map(({ id }) => id)];
    expect(rendered.skills.map(({ factId }) => factId)).toEqual(expectedIds);
    expect(rendered.skillGroups.map(({ category }) => category)).toEqual(["tool", "soft_skill", "practice"]);
    for (const group of rendered.skillGroups) {
      expect(group.skills).toEqual(
        rendered.skills
          .filter(({ category }) => category === group.category)
          .map(({ category, ...skill }) => skill),
      );
    }
    expect(rendered.languages.map(({ level }) => level)).toEqual(["native", "fluent"]);
    expect(renderResume(extendedBank, { ...selected, skillIds: ["skl_item-0"] }, "en").skillGroups).toEqual([
      { category: "practice", skills: [{ factId: "skl_item-0", name: "Habilidade 0", level: "advanced" }] },
    ]);
    expect(renderResume(extendedBank, { ...selected, skillIds: [] }, "en").skillGroups).toEqual([]);
  });

  it("separa cursos, certificações, bootcamps e idiomas sem duplicar", () => {
    const extendedBank = FactBankSchema.parse({
      ...sampleBank,
      facts: [
        ...sampleBank.facts,
        ...(["course", "certification", "bootcamp"] as const).map((type) => ({
          id: `edu_${type}`,
          kind: "education",
          title: type,
          institution: "Instituição",
          type,
          status: "completed",
          period: { start: "2024-01", end: "2024-02" },
        })),
        { id: "skl_english", kind: "skill", name: "Inglês", category: "spoken_language", level: "advanced" },
        { id: "skl_spanish", kind: "skill", name: "Espanhol", category: "spoken_language" },
      ],
    });
    const rendered = renderResume(
      extendedBank,
      {
        ...draft,
        skillIds: [...draft.skillIds, "skl_english", "skl_spanish"],
        educationIds: [...draft.educationIds, "edu_course", "edu_certification", "edu_bootcamp"],
      },
      "pt-BR",
    );
    expect(rendered.education.map(({ factId }) => factId)).toEqual(["edu_ads"]);
    expect(rendered.certifications.map(({ type }) => type)).toEqual(["course", "certification", "bootcamp"]);
    expect(rendered.certifications[0]).toMatchObject({
      title: "course",
      institution: "Instituição",
      status: "completed",
      period: { start: "2024-01", end: "2024-02" },
    });
    expect(rendered.skills.map(({ factId }) => factId)).toEqual(draft.skillIds);
    expect(rendered.languages).toEqual([
      { factId: "skl_english", name: "Inglês", category: "spoken_language", level: "advanced" },
      { factId: "skl_spanish", name: "Espanhol", category: "spoken_language" },
    ]);
    const archivedBank = FactBankSchema.parse({
      ...extendedBank,
      facts: extendedBank.facts.map((fact) => ({ ...fact, archived: true })),
    });
    expect(
      renderResume(
        archivedBank,
        {
          ...draft,
          skillIds: ["skl_english"],
          educationIds: ["edu_course"],
        },
        "pt-BR",
      ),
    ).toMatchObject({ education: [], certifications: [], skills: [], languages: [] });
  });

  it("prioriza jobSkillIds e mantém as demais skills na ordem do rascunho", () => {
    const selected = { ...draft, skillIds: ["skl_selenium", "skl_postgresql", "skl_django", "skl_python"] };
    const originalOrder = [...selected.skillIds];
    const rendered = renderResume(bank, selected, "pt-BR", [
      "skl_missing",
      "skl_python",
      "skl_postgresql",
      "skl_python",
    ]);
    expect(rendered.skills.map(({ factId }) => factId)).toEqual([
      "skl_python",
      "skl_postgresql",
      "skl_selenium",
      "skl_django",
    ]);
    expect(selected.skillIds).toEqual(originalOrder);
    expect(renderResume(bank, selected, "pt-BR").skills.map(({ factId }) => factId)).toEqual(originalOrder);
  });

  it("resolve experiências e preserva a ordem dos bullets e as datas", () => {
    const rendered = renderResume(bank, draft, "pt-BR");
    const experience = bank.facts.find((fact) => fact.kind === "experience")!;
    expect(experience.kind).toBe("experience");
    if (experience.kind !== "experience") throw new Error("expected_experience");

    expect(rendered.experiences).toEqual([
      {
        factId: experience.id,
        company: experience.company,
        role: experience.role,
        period: experience.period,
        employmentType: experience.employmentType,
        workMode: experience.workMode,
        bullets: ["Primeiro bullet", "Segundo bullet"],
      },
    ]);
    expect(rendered.profile).toEqual(bank.profile);
    expect(rendered.locale).toBe("pt-BR");
    expect(rendered.headline).toBe(bank.profile.headline);
  });

  it("resolve projetos, skills e educação na ordem do draft", () => {
    const rendered = renderResume(bank, draft, "en");
    expect(rendered.locale).toBe("en");
    expect(rendered.projects).toEqual([
      {
        factId: "prj_balance",
        name: "Balance",
        period: { start: "2025-01", end: null },
        url: "https://example.com",
        bullets: ["Projeto web"],
      },
    ]);
    expect(rendered.skills).toEqual([
      { factId: "skl_postgresql", name: "PostgreSQL", category: "database" },
      { factId: "skl_python", name: "Python", category: "programming_language", level: "advanced" },
    ]);
    expect(rendered.education).toEqual([
      {
        factId: "edu_ads",
        institution: "Universidade Exemplo",
        title: "Análise e Desenvolvimento de Sistemas",
        type: "technologist",
        status: "in_progress",
        period: { start: "2024-02", end: null },
      },
    ]);
  });

  it("usa os textos de headline e summary do draft", () => {
    const rendered = renderResume(
      bank,
      {
        ...draft,
        headline: { text: "Título adaptado", sourceFactIds: ["exp_coop-dev"] },
        summary: { text: "Resumo adaptado", sourceFactIds: ["exp_coop-dev"] },
      },
      "pt-BR",
    );
    expect(rendered.headline).toBe("Título adaptado");
    expect(rendered.summary).toBe("Resumo adaptado");
  });

  it("pula ids inexistentes, arquivados e de tipo errado em todas as seções", () => {
    const archivedBank = FactBankSchema.parse({
      ...sampleBank,
      facts: sampleBank.facts.map((fact) => ({ ...fact, archived: true })),
    });
    const invalidDraft: ResumeDraft = {
      experiences: [
        { factId: "exp_missing", bullets: [] },
        { factId: "skl_python", bullets: [] },
        ...draft.experiences,
      ],
      projects: [
        { factId: "prj_missing", bullets: [] },
        { factId: "exp_coop-dev", bullets: [] },
        ...draft.projects,
      ],
      skillIds: ["skl_missing", "edu_ads", ...draft.skillIds],
      educationIds: ["edu_missing", "skl_python", ...draft.educationIds],
    };
    expect(renderResume(bank, invalidDraft, "pt-BR")).toEqual(renderResume(bank, draft, "pt-BR"));
    expect(renderResume(archivedBank, invalidDraft, "pt-BR")).toMatchObject({
      experiences: [],
      projects: [],
      skills: [],
      education: [],
    });
  });
});

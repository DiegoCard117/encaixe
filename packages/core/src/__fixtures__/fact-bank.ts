import type { FactBankInput } from "../schema";

/** Banco de exemplo (dados fictícios) reutilizado nos testes. */
export const sampleBank = {
  schemaVersion: 1,
  profile: {
    fullName: "Fulano de Tal",
    headline: "Desenvolvedor Python",
    email: "fulano@example.com",
    location: "Cascavel, PR",
    links: [{ label: "GitHub", url: "https://github.com/fulano" }],
  },
  facts: [
    { id: "skl_python", kind: "skill", name: "Python", category: "programming_language", level: "advanced" },
    { id: "skl_django", kind: "skill", name: "Django", category: "framework" },
    { id: "skl_selenium", kind: "skill", name: "Selenium", category: "library" },
    {
      id: "skl_postgresql",
      kind: "skill",
      name: "PostgreSQL",
      aliases: ["Postgres"],
      category: "database",
    },
    {
      id: "exp_coop-dev",
      kind: "experience",
      company: "Cooperativa Exemplo",
      role: "Desenvolvedor Python",
      employmentType: "employee",
      workMode: "onsite",
      period: { start: "2024-03", end: null },
      skillIds: ["skl_python", "skl_django", "skl_postgresql"],
      tags: ["backend", "credito"],
    },
    {
      id: "ach_automacao-credito",
      kind: "achievement",
      contextId: "exp_coop-dev",
      text: "Automatizei a conferência de propostas de crédito com Selenium, reduzindo o tempo de análise em 40%.",
      metrics: [{ value: 40, unit: "%", label: "redução no tempo de análise" }],
      skillIds: ["skl_python", "skl_selenium"],
      tags: ["automacao"],
    },
    {
      id: "prj_balance",
      kind: "project",
      name: "Balance",
      description: "App web de rebalanceamento de carteira de investimentos.",
      period: { start: "2025-01", end: null },
      url: "https://example.com",
      skillIds: ["skl_django", "skl_postgresql"],
    },
    {
      id: "edu_ads",
      kind: "education",
      institution: "Universidade Exemplo",
      title: "Análise e Desenvolvimento de Sistemas",
      type: "technologist",
      status: "in_progress",
      period: { start: "2024-02", end: null },
    },
  ],
} satisfies FactBankInput;

import { describe, expect, it, vi } from "vitest";
import { sampleBank } from "../__fixtures__/fact-bank";
import { analyzeFit } from "../check/fit";
import { FactBankSchema } from "../schema/bank";
import { ResumeDraftSchema } from "../schema/resume";
import { buildResumePrompt, generateResumeDraft, looksTruncated, parseResumeDraft } from "./llm";

const bank = FactBankSchema.parse(sampleBank);
const vaga = "Desenvolvedor Python com Django, PostgreSQL e Kubernetes.";
const fit = analyzeFit(bank, vaga);
const input = { bank, jobText: vaga, fit, locale: "pt-BR" as const };
const draft = ResumeDraftSchema.parse({
  experiences: [
    {
      factId: "exp_coop-dev",
      bullets: [{ text: "Automatizei a análise, reduzindo 60%.", sourceFactIds: ["ach_automacao-credito"] }],
    },
  ],
});

describe("buildResumePrompt", () => {
  it("envia termos cobertos e regras de aderência com suporte nos fatos", () => {
    const jobText = "Desenvolvedor Python com SQL e APIs REST";
    const messages = buildResumePrompt({ ...input, jobText, fit: analyzeFit(bank, jobText) });
    const data = JSON.parse(messages.user.split("\n\nFact data:\n")[1]!);
    expect(data.coveredTerms).toEqual([{ term: "SQL", via: ["PostgreSQL"] }]);
    expect(messages.system).toContain("Mirror the job posting's exact wording");
    expect(messages.system).toContain('"atendimento ao cliente" / "customer service"');
    expect(messages.system).toContain("Never add a claim the cited facts do not support");
    expect(messages.system).toContain(
      "A covered term may be written when citing a fact that has one of its via skills",
    );
    expect(messages.system).toContain("Order experience and project bullets by relevance to the job");
    expect(messages.system).toContain(
      "choose the headline and summary to match the job title and main requirements",
    );
    expect(messages.system).toContain(
      "Never claim seniority, titles, certifications or years of experience that are not in the facts",
    );
    expect(messages.system).toContain(
      "skillIds: include every skill supported by the facts that the job mentions first",
    );
    expect(messages.system).toContain(
      "Keep each bullet one sentence, starting with a strong past-tense or present verb, with numbers from the facts when available",
    );
  });

  it("exige histórico completo, resumo, foco na vaga, voz consistente e fontes sem duplicação", () => {
    const { system } = buildResumePrompt(input);
    for (const rule of [
      "Include EVERY non-archived experience fact in experiences",
      "no gaps in the career timeline",
      "Less relevant experiences get 1–2 bullets; the most relevant get more",
      "Never drop an experience to save space",
      "Always write headline and summary, each with sourceFactIds",
      "The headline names the role the posting is hiring for",
      "phrased only with titles/skills the facts support",
      "never copy the profile's long multi-part headline verbatim if it does not match the posting",
      "The summary has 2–4 sentences",
      "posting's main responsibilities and requirements",
      "Weight day-to-day responsibilities and required qualifications above nice-to-have or valued items and above company marketing text",
      "Never present the same work twice",
      "same name/organization",
      "use only the one that fits best",
      "Keep every experience; omit the duplicate project",
      "in pt-BR, use first person without pronoun",
      'present tense for current roles ("Desenvolvo", "Atendo", "Coordeno")',
      'past tense for previous roles ("Desenvolvi", "Atendi", "Coordenei")',
      "In en, use action verbs without pronoun, present for current roles and past for previous roles",
      "Rewriting tense is allowed; changing meaning is not",
      "Include relevant certifications/courses in educationIds, and spoken languages in skillIds when present in the facts",
      "Never invent a language level",
      "Every headline, summary and bullet must include sourceFactIds",
    ]) {
      expect(system).toContain(rule);
    }
    expect(system).not.toContain("Optional headline and summary");
    expect(system).not.toContain("APIs REST");
  });

  it.each(["pt-BR", "en"] as const)("inclui os fatos ativos e o locale %s", (locale) => {
    const bankWithArchive = FactBankSchema.parse({
      ...sampleBank,
      facts: [
        ...sampleBank.facts,
        {
          id: "skl_archived",
          kind: "skill",
          name: "ArchivedOnlyTechnology",
          category: "tool",
          archived: true,
        },
      ],
    });
    const archiveFit = analyzeFit(bankWithArchive, vaga);
    const messages = buildResumePrompt({ ...input, bank: bankWithArchive, fit: archiveFit, locale });

    expect(messages.system).toContain(locale);
    expect(messages.user).toContain(vaga);
    for (const fact of bankWithArchive.facts.filter((fact) => !fact.archived)) {
      expect(messages.user).toContain(fact.id);
    }
    expect(messages.user).not.toContain("skl_archived");
    expect(messages.user).not.toContain("ArchivedOnlyTechnology");
    expect(messages.user).not.toContain('"archived"');

    const data = JSON.parse(messages.user.split("\n\nFact data:\n")[1]!);
    expect(data.profile).toEqual({ headline: bank.profile.headline });
    expect(data.priorityFactIds).toEqual(archiveFit.rankedFacts.map((fact) => fact.factId));
    expect(data.gaps).toEqual(archiveFit.gaps.map((term) => ({ term, instruction: "do not use" })));
    expect(data.facts).toEqual(
      bankWithArchive.facts.filter((fact) => !fact.archived).map(({ archived, ...fact }) => fact),
    );
  });
});

describe("parseResumeDraft", () => {
  it("aceita JSON puro", () => {
    expect(parseResumeDraft(JSON.stringify(draft))).toEqual({ ok: true, draft });
  });

  it("ignora chaves no texto antes do JSON", () => {
    expect(parseResumeDraft(`Use {nome} no texto. ${JSON.stringify(draft)}`)).toEqual({ ok: true, draft });
    expect(parseResumeDraft(`${"{nome} ".repeat(20)}${JSON.stringify(draft)}`)).toEqual({
      ok: false,
      error: "invalid_json",
      issues: [],
    });
  });

  it.each(["json", ""])("aceita cerca de código %s", (language) => {
    expect(parseResumeDraft(`\n\`\`\`${language}\n${JSON.stringify(draft)}\n\`\`\`\n`)).toEqual({
      ok: true,
      draft,
    });
  });

  it("aceita texto antes e depois do JSON, com ou sem cerca", () => {
    const json = JSON.stringify(draft);
    expect(parseResumeDraft(`Aqui está o JSON:\n\`\`\`json\n${json}\n\`\`\`\nEspero ter ajudado.`)).toEqual({
      ok: true,
      draft,
    });
    expect(parseResumeDraft(`Claro! ${json} Qualquer coisa, me avise.`)).toEqual({ ok: true, draft });
  });

  it("detecta resposta cortada no meio", () => {
    const json = JSON.stringify(draft);
    expect(looksTruncated(json.slice(0, -10))).toBe(true);
    expect(looksTruncated(`\`\`\`json\n${json.slice(0, -10)}`)).toBe(true);
    expect(looksTruncated(json)).toBe(false);
    expect(looksTruncated(`\`\`\`json\n${json}\n\`\`\``)).toBe(false);
    expect(looksTruncated("lixo")).toBe(false);
  });

  it("retorna invalid_json para lixo", () => {
    expect(parseResumeDraft("lixo")).toEqual({ ok: false, error: "invalid_json", issues: [] });
  });

  it("retorna invalid_schema com as issues do zod", () => {
    const parsed = ResumeDraftSchema.safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("expected_invalid_schema");
    expect(parseResumeDraft("{}")).toEqual({
      ok: false,
      error: "invalid_schema",
      issues: parsed.error.issues,
    });
  });
});

describe("generateResumeDraft", () => {
  it("envia o prompt e detecta número sem suporte no draft válido", async () => {
    const callLlm = vi.fn(async () => JSON.stringify(draft));
    const generated = await generateResumeDraft(input, callLlm);

    expect(callLlm).toHaveBeenCalledOnce();
    expect(callLlm).toHaveBeenCalledWith(buildResumePrompt(input));
    expect(generated.result).toEqual({ ok: true, draft });
    expect(generated.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "unsupported_number" })]),
    );
  });

  it("retorna falha sem violações para lixo", async () => {
    expect(await generateResumeDraft(input, async () => "lixo")).toEqual({
      result: { ok: false, error: "invalid_json", issues: [] },
      violations: [],
    });
  });
});

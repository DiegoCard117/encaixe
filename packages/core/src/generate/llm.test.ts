import { describe, expect, it, vi } from "vitest";
import { sampleBank } from "../__fixtures__/fact-bank";
import { analyzeFit } from "../check/fit";
import { FactBankSchema } from "../schema/bank";
import { ResumeDraftSchema } from "../schema/resume";
import { buildResumePrompt, generateResumeDraft, parseResumeDraft } from "./llm";

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

  it.each(["json", ""])("aceita cerca de código %s", (language) => {
    expect(parseResumeDraft(`\n\`\`\`${language}\n${JSON.stringify(draft)}\n\`\`\`\n`)).toEqual({
      ok: true,
      draft,
    });
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

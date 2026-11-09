import { describe, expect, it } from "vitest";
import { sampleBank } from "../__fixtures__/fact-bank";
import {
  FactBankSchema,
  NonEmptyText,
  ResumeDraftSchema,
  createEmptyFactBank,
  createFactId,
  indexFacts,
  kindOfFactId,
  type FactBankInput,
} from "./index";

/** Clona o banco de exemplo e aplica uma alteração. */
function withFacts(mutate: (facts: FactBankInput["facts"]) => void): FactBankInput {
  const bank = JSON.parse(JSON.stringify(sampleBank)) as FactBankInput;
  mutate(bank.facts);
  return bank;
}

function issues(input: unknown) {
  const result = FactBankSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((i) => ({
        message: i.message,
        params: i.code === "custom" ? i.params : undefined,
      }));
}

describe("FactBankSchema", () => {
  it("aceita um banco válido e aplica defaults", () => {
    const bank = FactBankSchema.parse(sampleBank);
    expect(bank.locale).toBe("pt-BR");
    const edu = bank.facts.find((f) => f.id === "edu_ads");
    expect(edu?.tags).toEqual([]);
    expect(edu?.archived).toBe(false);
  });

  it("cria banco vazio", () => {
    const bank = createEmptyFactBank({ fullName: "Fulano" });
    expect(bank.facts).toEqual([]);
    expect(bank.schemaVersion).toBe(1);
  });

  it("rejeita id duplicado", () => {
    const input = withFacts((facts) => facts.push({ ...facts[0]!, name: "Outro" } as never));
    expect(issues(input)).toContainEqual({ message: "duplicate_id", params: { id: "skl_python" } });
  });

  it("rejeita id com prefixo de outro tipo", () => {
    const input = withFacts((facts) => {
      facts.push({ id: "exp_errado", kind: "skill", name: "Go", category: "programming_language" });
    });
    expect(issues(input)).toContainEqual({ message: "fact_id_wrong_kind", params: undefined });
  });

  it("rejeita skillId inexistente", () => {
    const input = withFacts((facts) => {
      const exp = facts.find((f) => f.id === "exp_coop-dev");
      if (exp?.kind === "experience") exp.skillIds = ["skl_java"];
    });
    expect(issues(input)).toContainEqual({ message: "missing_reference", params: { id: "skl_java" } });
  });

  it("rejeita conquista com contexto de tipo errado", () => {
    const input = withFacts((facts) => {
      const ach = facts.find((f) => f.id === "ach_automacao-credito");
      if (ach?.kind === "achievement") ach.contextId = "skl_python";
    });
    expect(issues(input)).toContainEqual({
      message: "wrong_reference_kind",
      params: { id: "skl_python", actual: "skill", expected: ["experience", "project", "education"] },
    });
  });

  it("rejeita período com fim antes do início", () => {
    const input = withFacts((facts) => {
      const exp = facts.find((f) => f.id === "exp_coop-dev");
      if (exp?.kind === "experience") exp.period = { start: "2024-03", end: "2023-01" };
    });
    expect(issues(input)).toContainEqual({ message: "period_end_before_start", params: undefined });
  });

  it("rejeita apelido de skill ambíguo", () => {
    const input = withFacts((facts) => {
      facts.push({ id: "skl_pg", kind: "skill", name: "postgres", category: "database" });
    });
    expect(issues(input)).toContainEqual({
      message: "ambiguous_skill_name",
      params: { name: "postgres", owner: "skl_postgresql" },
    });
  });

  it("indexa fatos por id", () => {
    const index = indexFacts(FactBankSchema.parse(sampleBank));
    expect(index.get("prj_balance")?.kind).toBe("project");
  });
});

describe("NonEmptyText", () => {
  it("retorna required para texto vazio", () => {
    const result = NonEmptyText(120).safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([expect.objectContaining({ message: "required" })]);
    }
  });
});

describe("ids", () => {
  it("gera id com prefixo do tipo", () => {
    expect(createFactId("achievement", () => "ABC123def")).toBe("ach_abc123def");
    expect(createFactId("skill")).toMatch(/^skl_[a-z0-9]{12}$/);
  });

  it("descobre o tipo pelo prefixo", () => {
    expect(kindOfFactId("prj_balance")).toBe("project");
    expect(kindOfFactId("xyz_balance")).toBeUndefined();
  });
});

describe("ResumeDraftSchema", () => {
  const bullet = {
    text: "Automatizei a conferência de propostas.",
    sourceFactIds: ["ach_automacao-credito"],
  };

  it("aceita rascunho com bullets citados", () => {
    const draft = ResumeDraftSchema.parse({
      experiences: [{ factId: "exp_coop-dev", bullets: [bullet] }],
      skillIds: ["skl_python"],
    });
    expect(draft.projects).toEqual([]);
  });

  it("rejeita bullet sem fact_id de origem", () => {
    const result = ResumeDraftSchema.safeParse({
      experiences: [{ factId: "exp_coop-dev", bullets: [{ ...bullet, sourceFactIds: [] }] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          message: "source_required",
          path: ["experiences", 0, "bullets", 0, "sourceFactIds"],
        }),
      ]);
    }
  });

  it("rejeita referência de tipo errado (skill no lugar de experiência)", () => {
    const result = ResumeDraftSchema.safeParse({
      experiences: [{ factId: "skl_python", bullets: [bullet] }],
    });
    expect(result.success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { sampleBank } from "@encaixe/core/fixtures";
import { run } from "./cli";

function memoryIO(
  files: Record<string, string> = {},
  stdin = "",
  env: Record<string, string | undefined> = { LANG: "pt_BR.UTF-8" },
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  let stdinReads = 0;
  return {
    stdout,
    stderr,
    get stdinReads() {
      return stdinReads;
    },
    io: {
      async readFile(path: string) {
        if (!Object.hasOwn(files, path)) throw new Error("ENOENT");
        return files[path]!;
      },
      async readStdin() {
        stdinReads++;
        return stdin;
      },
      stdout: (line: string) => {
        stdout.push(line);
      },
      stderr: (line: string) => {
        stderr.push(line);
      },
      env,
    },
  };
}

const bankJSON = JSON.stringify(sampleBank);
const skill = sampleBank.facts.find((fact) => fact.kind === "skill")!;
const emptyDraft = { experiences: [], projects: [], skillIds: [], educationIds: [] };

describe("CLI", () => {
  it("valida um banco e informa as contagens", async () => {
    const output = memoryIO({ "bank.json": bankJSON });
    expect(await run(["validate", "bank.json"], output.io)).toBe(0);
    expect(output.stdout.join("\n")).toContain(`Banco válido. Fatos: ${sampleBank.facts.length}`);
    expect(output.stdout.join("\n")).toContain("experiências");
    expect(output.stderr).toEqual([]);
  });

  it("informa caminho técnico e tradução de banco inválido", async () => {
    const index = sampleBank.facts.indexOf(skill);
    const invalidBank = {
      ...sampleBank,
      facts: sampleBank.facts.map((fact, i) => (i === index ? { ...fact, name: "" } : fact)),
    };
    const output = memoryIO({ "bank.json": JSON.stringify(invalidBank) });
    expect(await run(["validate", "bank.json"], output.io)).toBe(1);
    expect(output.stderr).toContain(`facts[${index}].name: Campo obrigatório`);
    expect(output.stdout).toEqual([]);
  });

  it("detecta número sem apoio nas fontes", async () => {
    const draft = {
      ...emptyDraft,
      headline: { text: "Resultado 987654321", sourceFactIds: [skill.id] },
    };
    const output = memoryIO({ "bank.json": bankJSON, "draft.json": JSON.stringify(draft) });
    expect(await run(["check", "bank.json", "draft.json"], output.io)).toBe(1);
    expect(output.stderr).toContain("headline.text: Número sem apoio nas fontes: 987654321");
    expect(output.stderr).toContain("Violações: 1");
  });

  it("aceita rascunho sem violações em bloco JSON", async () => {
    const output = memoryIO({
      "bank.json": bankJSON,
      "draft.json": "```json\n" + JSON.stringify(emptyDraft) + "\n```",
    });
    expect(await run(["check", "bank.json", "draft.json"], output.io)).toBe(0);
    expect(output.stdout).toEqual(["Nenhuma invenção encontrada."]);
    expect(output.stderr).toEqual([]);
  });

  it("lista uma skill correspondente e uma lacuna", async () => {
    const reducedBank = { ...sampleBank, facts: sampleBank.facts.filter((fact) => fact.id === "skl_python") };
    const matched = { name: "Python" };
    const gap = "Docker";
    const output = memoryIO({
      "bank.json": JSON.stringify(reducedBank),
      "job.txt": `${matched.name}, ${gap}`,
    });
    expect(await run(["fit", "bank.json", "job.txt"], output.io)).toBe(0);
    expect(output.stdout).toContain(`Skills que batem: ${matched.name}`);
    expect(output.stdout).toContain(`Lacunas: ${gap}`);
  });

  it("emite JSON de violações sem mensagens traduzidas", async () => {
    const output = memoryIO({
      "bank.json": bankJSON,
      "draft.json": JSON.stringify({
        ...emptyDraft,
        headline: { text: "Resultado 987654321", sourceFactIds: [skill.id] },
      }),
    });
    expect(await run(["check", "bank.json", "draft.json", "--json"], output.io)).toBe(1);
    expect(output.stdout).toHaveLength(1);
    expect(JSON.parse(output.stdout[0]!)).toEqual({
      ok: false,
      violations: [{ code: "unsupported_number", path: ["headline", "text"], value: "987654321" }],
    });
    expect(output.stderr).toEqual([]);
  });

  it("emite apenas código, caminho e parâmetros para issues em JSON", async () => {
    const invalidBank = { ...sampleBank, facts: [...sampleBank.facts, skill] };
    const output = memoryIO({ "bank.json": JSON.stringify(invalidBank) });
    expect(await run(["validate", "bank.json", "--json"], output.io)).toBe(1);
    expect(JSON.parse(output.stdout[0]!)).toEqual({
      ok: false,
      issues: [
        { path: ["facts", sampleBank.facts.length, "id"], code: "duplicate_id", params: { id: skill.id } },
      ],
    });
    expect(output.stderr).toEqual([]);
  });

  it("emite JSON de sucesso para check e fit", async () => {
    const output = memoryIO({
      "bank.json": bankJSON,
      "draft.json": JSON.stringify(emptyDraft),
      "job.txt": "",
    });
    expect(await run(["check", "bank.json", "draft.json", "--json"], output.io)).toBe(0);
    expect(JSON.parse(output.stdout[0]!)).toEqual({ ok: true, violations: [] });
    expect(await run(["fit", "bank.json", "job.txt", "--json"], output.io)).toBe(0);
    expect(JSON.parse(output.stdout[1]!)).toEqual({
      ok: true,
      fit: { matchedSkills: [], gaps: [], rankedFacts: [] },
    });
  });

  it("respeita --lang en", async () => {
    const output = memoryIO({ "bank.json": bankJSON });
    expect(await run(["validate", "bank.json", "--lang", "en"], output.io)).toBe(0);
    expect(output.stdout[0]).toContain("Valid bank.");
  });

  it("usa LC_ALL antes de LANG e inglês sem locale", async () => {
    for (const env of [{ LC_ALL: "en_US.UTF-8", LANG: "pt_BR.UTF-8" }, {}]) {
      const output = memoryIO({ "bank.json": bankJSON }, "", env);
      expect(await run(["validate", "bank.json"], output.io)).toBe(0);
      expect(output.stdout[0]).toContain("Valid bank.");
    }
  });

  it("retorna 2 para arquivo inexistente", async () => {
    const output = memoryIO();
    expect(await run(["validate", "missing.json"], output.io)).toBe(2);
    expect(output.stderr).toEqual(["Não foi possível ler: missing.json"]);
    expect(output.stdout).toEqual([]);
  });

  it.each([
    ["unknown"],
    ["validate"],
    ["validate", "a", "b"],
    ["check", "-", "-"],
    ["fit", "a"],
    ["validate", "a", "--lang", "fr"],
    ["validate", "a", "--unknown"],
  ])("retorna 2 para uso inválido: %j", async (...argv) => {
    const output = memoryIO();
    expect(await run(argv, output.io)).toBe(2);
    expect(output.stderr).toHaveLength(1);
    expect(output.stdout).toEqual([]);
    expect(output.stdinReads).toBe(0);
  });

  it("distingue JSON inválido de rascunho com schema inválido", async () => {
    const output = memoryIO({ "bank.json": bankJSON, "broken.json": "{", "draft.json": "{}" });
    expect(await run(["check", "bank.json", "broken.json"], output.io)).toBe(2);
    expect(await run(["check", "bank.json", "draft.json"], output.io)).toBe(1);
    const invalidBank = memoryIO({ "bank.json": "{" });
    expect(await run(["validate", "bank.json"], invalidBank.io)).toBe(2);
  });

  it("lê banco pela entrada padrão", async () => {
    const output = memoryIO({}, bankJSON);
    expect(await run(["validate", "-"], output.io)).toBe(0);
    expect(output.stdinReads).toBe(1);
  });

  it.each(["check", "fit"])("lê o segundo arquivo de %s pela entrada padrão", async (command) => {
    const output = memoryIO({ "bank.json": bankJSON }, command === "check" ? JSON.stringify(emptyDraft) : "");
    expect(await run([command, "bank.json", "-"], output.io)).toBe(0);
    expect(output.stdinReads).toBe(1);
  });

  it.each(["--help", "-h"])("mostra ajuda com %s", async (flag) => {
    const output = memoryIO();
    expect(await run([flag], output.io)).toBe(0);
    expect(output.stdout[0]).toContain("Uso: pnpm cli");
    expect(output.stderr).toEqual([]);
  });
});

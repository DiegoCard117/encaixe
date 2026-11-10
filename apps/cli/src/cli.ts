import { parseArgs } from "node:util";
import {
  FactBankSchema,
  VALIDATION_CODES,
  analyzeFit,
  checkResumeDraft,
  parseResumeDraft,
} from "@encaixe/core";
import { interpolate, messages, type Locale } from "./messages";

type IO = {
  readFile(path: string): Promise<string>;
  readStdin(): Promise<string>;
  stdout(line: string): void;
  stderr(line: string): void;
  env: Record<string, string | undefined>;
};

type Issue = {
  path: PropertyKey[];
  code: string;
  message: string;
  params?: Record<string, unknown>;
};

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>(
    (result, part) =>
      typeof part === "number" ? `${result}[${part}]` : `${result ? `${result}.` : ""}${String(part)}`,
    "",
  );
}

export async function run(argv: string[], io: IO): Promise<number> {
  let locale: Locale = /^pt/i.test(io.env.LC_ALL || io.env.LANG || "") ? "pt-BR" : "en";
  let json = false;
  const fail = (code: "invalid_usage" | "read_error" | "invalid_json", path?: string) => {
    if (json)
      io.stderr(JSON.stringify({ ok: false, error: { code, ...(path === undefined ? {} : { path }) } }));
    else {
      const key =
        code === "invalid_usage" ? "invalidUsage" : code === "read_error" ? "readError" : "invalidJson";
      io.stderr(interpolate(messages[locale].cli[key], { path }));
    }
    return 2;
  };

  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        json: { type: "boolean" },
        lang: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    });
    json = parsed.values.json ?? false;
    if (parsed.values.lang !== undefined) {
      if (parsed.values.lang !== "pt-BR" && parsed.values.lang !== "en") return fail("invalid_usage");
      locale = parsed.values.lang;
    }
    if (parsed.values.help) {
      io.stdout(
        json
          ? JSON.stringify({ ok: true, commands: ["validate", "check", "fit"] })
          : messages[locale].cli.help,
      );
      return 0;
    }
    positionals = parsed.positionals;
  } catch {
    // Preserve machine-readable errors even when another option cannot be parsed.
    json = argv.includes("--json");
    return fail("invalid_usage");
  }

  const [command, ...paths] = positionals;
  if (
    !(command === "validate" || command === "check" || command === "fit") ||
    paths.length !== (command === "validate" ? 1 : 2) ||
    paths.some((path) => !path) ||
    paths.filter((path) => path === "-").length > 1
  )
    return fail("invalid_usage");

  const dictionary = messages[locale];
  const read = (path: string) => (path === "-" ? io.readStdin() : io.readFile(path));
  const reportIssues = (issues: Issue[]) => {
    const normalized = issues.map((issue) => ({
      path: issue.path,
      code: VALIDATION_CODES.find((code) => code === issue.message) ?? issue.code,
      params: issue.params ?? {},
    }));
    if (json) io.stdout(JSON.stringify({ ok: false, issues: normalized }));
    else
      issues.forEach((issue, i) => {
        const code = VALIDATION_CODES.find((candidate) => candidate === normalized[i]!.code);
        const text = code
          ? interpolate(dictionary.validation[code], issue.params)
          : dictionary.cli.invalidValue;
        io.stderr(`${formatPath(issue.path)}: ${text}`);
      });
    return 1;
  };

  const bankPath = paths[0]!;
  let bankText: string;
  try {
    bankText = await read(bankPath);
  } catch {
    return fail("read_error", bankPath);
  }
  let bankValue: unknown;
  try {
    bankValue = JSON.parse(bankText);
  } catch {
    return fail("invalid_json", bankPath);
  }
  const parsedBank = FactBankSchema.safeParse(bankValue);
  if (!parsedBank.success) return reportIssues(parsedBank.error.issues);
  const bank = parsedBank.data;

  if (command === "validate") {
    const counts = {
      experience: 0,
      achievement: 0,
      project: 0,
      education: 0,
      skill: 0,
    };
    for (const fact of bank.facts) counts[fact.kind]++;
    if (json) io.stdout(JSON.stringify({ ok: true, facts: bank.facts.length, counts }));
    else
      io.stdout(
        interpolate(dictionary.cli.validBank, {
          count: bank.facts.length,
          counts: (Object.keys(counts) as (keyof typeof counts)[])
            .map((kind) => `${dictionary.cli[kind]}: ${counts[kind]}`)
            .join(", "),
        }),
      );
    return 0;
  }

  const inputPath = paths[1]!;
  let input: string;
  try {
    input = await read(inputPath);
  } catch {
    return fail("read_error", inputPath);
  }

  if (command === "check") {
    const parsed = parseResumeDraft(input);
    if (!parsed.ok) {
      if (parsed.error === "invalid_json") return fail("invalid_json", inputPath);
      return reportIssues(parsed.issues);
    }
    const violations = checkResumeDraft(bank, parsed.draft);
    if (json) io.stdout(JSON.stringify({ ok: violations.length === 0, violations }));
    else if (violations.length === 0) io.stdout(dictionary.cli.noViolations);
    else {
      for (const violation of violations) {
        io.stderr(
          `${formatPath(violation.path)}: ${interpolate(dictionary.violations[violation.code], { value: violation.value })}`,
        );
      }
      io.stderr(interpolate(dictionary.cli.violationsTotal, { count: violations.length }));
    }
    return violations.length ? 1 : 0;
  }

  const fit = analyzeFit(bank, input);
  if (json) io.stdout(JSON.stringify({ ok: true, fit }));
  else {
    const byId = new Map(bank.facts.map((fact) => [fact.id, fact]));
    const skillNames = fit.matchedSkills.map(({ skillId }) => {
      const skill = byId.get(skillId);
      return skill?.kind === "skill" ? skill.name : skillId;
    });
    io.stdout(`${dictionary.cli.matchedSkills}: ${skillNames.join(", ") || dictionary.cli.none}`);
    if (fit.impliedSkills.length)
      io.stdout(
        `${dictionary.cli.implied}: ${fit.impliedSkills.map(({ term, via }) => `${term} (${via.join(", ")})`).join(", ")}`,
      );
    io.stdout(`${dictionary.cli.gaps}: ${fit.gaps.join(", ") || dictionary.cli.none}`);
    io.stdout(`${dictionary.cli.rankedFacts}:`);
    if (!fit.rankedFacts.length) io.stdout(dictionary.cli.none);
    for (const ranked of fit.rankedFacts.slice(0, 10)) {
      const fact = byId.get(ranked.factId)!;
      let title: string;
      switch (fact.kind) {
        case "experience":
          title = `${fact.role} · ${fact.company}`;
          break;
        case "achievement":
          title = fact.text;
          break;
        case "project":
          title = fact.name;
          break;
        case "education":
          title = `${fact.title} · ${fact.institution}`;
          break;
        case "skill":
          title = fact.name;
          break;
      }
      const shortTitle = title.replace(/\s+/g, " ").trim();
      io.stdout(
        `${ranked.factId} | ${ranked.score} | ${shortTitle.length > 100 ? `${shortTitle.slice(0, 99)}…` : shortTitle}`,
      );
    }
  }
  return 0;
}

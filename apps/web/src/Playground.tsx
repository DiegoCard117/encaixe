import { useState } from "react";
import { checkResumeDraft, FactBankSchema, ResumeDraftSchema, type ResumeDraft } from "@encaixe/core";
import { sampleBank } from "@encaixe/core/fixtures";
import { highlight } from "./highlight";
import { useI18n } from "./i18n";

const bank = FactBankSchema.parse(sampleBank);
const initialDraft: ResumeDraft = {
  headline: { text: "Desenvolvedor Python", sourceFactIds: ["exp_coop-dev"] },
  experiences: [
    {
      factId: "exp_coop-dev",
      bullets: [
        {
          text: "Automatizei a conferência de propostas de crédito com Selenium, reduzindo 40% do tempo de análise",
          sourceFactIds: ["ach_automacao-credito"],
        },
        {
          text: "Automatizei a conferência de propostas de crédito com Selenium, reduzindo o tempo de análise em 60%.",
          sourceFactIds: ["ach_automacao-credito"],
        },
        {
          text: "Automatizei a conferência de propostas de crédito usando Django.",
          sourceFactIds: ["ach_automacao-credito"],
        },
        {
          text: "Desenvolvi o app Balance para rebalanceamento de carteira de investimentos.",
          sourceFactIds: ["prj_balance"],
        },
      ],
    },
  ],
  projects: [],
  skillIds: [],
  educationIds: [],
};
const initialJson = JSON.stringify(initialDraft, null, 2);

function formatPath(path: PropertyKey[]): string {
  return path.reduce<string>(
    (result, part) =>
      typeof part === "number" ? `${result}[${part}]` : `${result ? `${result}.` : ""}${String(part)}`,
    "",
  );
}

export default function Playground() {
  const { locale, t, tViolation, tIssue } = useI18n();
  const [json, setJson] = useState(initialJson);
  const [clipboardResult, setClipboardResult] = useState<{ id: string; success: boolean }>();
  const clipboardMessage = clipboardResult
    ? t(clipboardResult.success ? "bank.copied" : "bank.copyFailed", { id: clipboardResult.id })
    : "";

  let draft: ResumeDraft | undefined;
  let errors: string[] = [];
  try {
    const result = ResumeDraftSchema.safeParse(JSON.parse(json));
    if (result.success) draft = result.data;
    else {
      errors = result.error.issues.map(
        (issue) => `${formatPath(issue.path) || t("draft.root")}: ${tIssue(issue)}`,
      );
    }
  } catch {
    errors = [`${t("draft.root")}: ${t("draft.invalidJson")}`];
  }
  const violations = draft ? checkResumeDraft(bank, draft) : [];

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setClipboardResult({ id, success: true });
    } catch {
      setClipboardResult({ id, success: false });
    }
  }

  return (
    <div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section
          className="min-w-0 rounded-xl border border-line bg-surface p-5 sm:p-6"
          aria-labelledby="bank-title"
        >
          <h2 id="bank-title" className="font-display text-lg font-semibold">
            {t("bank.title")}
          </h2>
          <p className="mt-2 text-sm text-muted">{t("bank.help")}</p>
          <p
            role="status"
            className={`mt-2 min-h-5 break-words text-sm ${clipboardResult?.success === false ? "text-warn-ink" : "text-accent-ink"}`}
          >
            {clipboardMessage}
          </p>
          <ul className="mt-2 divide-y divide-line">
            {bank.facts.map((fact) => {
              const summary =
                fact.kind === "skill"
                  ? [fact.name, ...fact.aliases].join(" · ")
                  : fact.kind === "experience"
                    ? `${fact.role} @ ${fact.company}`
                    : fact.kind === "achievement"
                      ? fact.text
                      : fact.kind === "project"
                        ? fact.name
                        : fact.title;
              return (
                <li key={fact.id} className="py-4">
                  <button
                    type="button"
                    onClick={() => void copyId(fact.id)}
                    aria-label={t("bank.copy", { id: fact.id })}
                    className="break-all text-left font-mono text-sm font-medium text-accent-ink underline decoration-accent/30 underline-offset-4 hover:decoration-accent"
                  >
                    {fact.id}
                  </button>
                  <p className="mt-1 truncate text-sm text-muted" title={summary}>
                    {summary}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
        <section
          className="min-w-0 rounded-xl border border-line bg-surface p-5 sm:p-6"
          aria-labelledby="draft-title"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="draft-title" className="font-display text-lg font-semibold">
              <label htmlFor="draft">{t("draft.title")}</label>
            </h2>
            <button
              type="button"
              onClick={() => setJson(initialJson)}
              className="rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-accent-soft"
            >
              {t("draft.reset")}
            </button>
          </div>
          <p id="draft-help" className="mb-3 text-sm text-muted">
            {t("draft.help")}
          </p>
          <textarea
            id="draft"
            aria-describedby="draft-help"
            aria-invalid={errors.length > 0}
            value={json}
            onChange={(event) => setJson(event.target.value)}
            spellCheck={false}
            className="block min-h-96 w-full resize-y rounded-lg border border-line bg-bg p-4 font-mono text-sm leading-relaxed"
            rows={22}
          />
          <div className="mt-5" aria-live="polite" aria-atomic="true">
            {errors.length > 0 ? (
              <ul className="space-y-2 break-words rounded-lg border border-warn-line bg-warn-soft p-4 text-sm text-warn-ink">
                {errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            ) : (
              <>
                <p
                  className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${violations.length ? "bg-warn-soft text-warn-ink" : "bg-accent-soft text-accent-ink"}`}
                >
                  {violations.length
                    ? t(violations.length === 1 ? "check.one" : "check.count", {
                        count: new Intl.NumberFormat(locale).format(violations.length),
                      })
                    : t("check.success")}
                </p>
                <h3 className="mb-3 mt-6 font-display font-semibold">{t("check.preview")}</h3>
                <div className="rounded-lg bg-[var(--paper)] p-4 text-[var(--paper-ink)] [color-scheme:light]">
                  {draft?.headline && (
                    <p className="mb-3 font-display text-lg font-medium">
                      {highlight(
                        draft.headline.text,
                        violations.filter(({ path }) => path[0] === "headline"),
                      )}
                    </p>
                  )}
                  {draft?.summary && (
                    <p className="mb-4">
                      {highlight(
                        draft.summary.text,
                        violations.filter(({ path }) => path[0] === "summary"),
                      )}
                    </p>
                  )}
                  {(["experiences", "projects"] as const).map((section) =>
                    draft?.[section].map((entry, entryIndex) => (
                      <div key={`${section}-${entryIndex}`} className="mb-5">
                        <h4 className="mb-2 break-all font-mono text-xs">{entry.factId}</h4>
                        <ul className="space-y-2">
                          {entry.bullets.map((bullet, bulletIndex) => {
                            const relevant = violations.filter(
                              ({ path }) =>
                                path[0] === section &&
                                path[1] === entryIndex &&
                                ((path[2] === "bullets" && path[3] === bulletIndex) || path[2] === "factId"),
                            );
                            const invalidSource = relevant.some(({ code }) =>
                              ["wrong_context", "unknown_fact", "archived_fact"].includes(code),
                            );
                            return (
                              <li
                                key={bulletIndex}
                                className={`break-words rounded-lg border p-3 text-sm leading-relaxed ${invalidSource ? "border-warn-line bg-warn-soft text-warn-ink" : "border-line"}`}
                              >
                                {highlight(bullet.text, relevant)}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )),
                  )}
                </div>
                {violations.length > 0 && (
                  <>
                    <h3 className="mb-3 mt-6 font-display font-semibold">{t("check.violations")}</h3>
                    <ul className="space-y-3">
                      {violations.map((violation, index) => (
                        <li
                          key={index}
                          className="break-words rounded-lg border border-warn-line bg-warn-soft p-3 text-sm text-warn-ink"
                        >
                          <p className="font-medium">{tViolation(violation)}</p>
                          <p className="mt-1 break-all font-mono text-xs">
                            {formatPath(violation.path) || t("draft.root")}
                          </p>
                          <p className="mt-2">
                            {t("check.value")} <span className="font-mono">{violation.value}</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

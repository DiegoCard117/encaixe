import { useState } from "react";
import {
  analyzeFit,
  checkResumeDraft,
  renderResume,
  type FactBank,
  type ResumeDraft,
  type Violation,
} from "@encaixe/core";
import { resumePresent, resumeT, useI18n } from "../i18n";
import { highlight } from "../highlight";
import { describePath } from "../paths";
import { loadDraft, saveDraft, useGeneration, type SavedDraft } from "../generation";
import SupportDialog from "../SupportDialog";
import { hasSupport } from "../support";

function EditableText({
  text,
  violations,
  label,
  onSave,
  onRemove,
  disabled,
}: {
  text: string;
  violations: Violation[];
  label: string;
  onSave: (text: string) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const badSource = violations.some(({ code }) =>
    ["wrong_context", "unknown_fact", "archived_fact"].includes(code),
  );
  return (
    <div
      className={`break-words rounded-lg border p-3 print:rounded-none print:border-0 print:p-0 ${badSource ? "border-warn-line" : "border-line"}`}
    >
      <p className={`whitespace-pre-wrap ${editing ? "hidden print:block" : ""}`}>
        {highlight(text, violations)}
      </p>
      {editing ? (
        <form
          className="space-y-2 print:hidden"
          onSubmit={(event) => {
            event.preventDefault();
            if (!value.trim()) return;
            onSave(value.trim());
            setEditing(false);
          }}
        >
          <label className="block">
            {label}
            <textarea
              className="rounded-lg border border-line bg-bg p-3 text-ink min-h-24 w-full"
              rows={3}
              autoFocus
              required
              maxLength={600}
              value={value}
              disabled={disabled}
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
          <button className="bank-button min-h-10" type="submit" disabled={disabled || !value.trim()}>
            {t("editor.save")}
          </button>
          <button
            className="bank-button min-h-10"
            type="button"
            disabled={disabled}
            onClick={() => setEditing(false)}
          >
            {t("editor.cancel")}
          </button>
        </form>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap gap-2 text-sm print:hidden">
            <button
              type="button"
              className="bank-button min-h-10"
              disabled={disabled}
              aria-label={`${t("editor.edit")} · ${label}`}
              onClick={() => {
                setValue(text);
                setEditing(true);
              }}
            >
              {t("editor.edit")}
            </button>
            <button
              type="button"
              className="bank-button min-h-10"
              disabled={disabled}
              aria-label={`${t("editor.remove")} · ${label}`}
              onClick={onRemove}
            >
              {t("editor.remove")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

function Review({ bank, initial }: { bank: FactBank; initial: SavedDraft }) {
  const { t, locale: uiLocale, tViolation } = useI18n();
  const [saved, setSaved] = useState(initial);
  const [storageError, setStorageError] = useState(false);
  const [exported, setExported] = useState(false);
  const [supporting, setSupporting] = useState(false);
  const { draft, locale, jobText } = saved;
  const generation = useGeneration(bank, jobText, locale, (value) => {
    setSaved(value);
    setStorageError(false);
  });
  const violations = checkResumeDraft(bank, draft);
  const fit = analyzeFit(bank, jobText);
  const jobSkillIds = [
    ...fit.matchedSkills.map(({ skillId }) => skillId),
    ...fit.impliedSkills.flatMap(({ via }) =>
      via.flatMap((name) =>
        bank.facts.flatMap((fact) =>
          !fact.archived && fact.kind === "skill" && fact.name === name ? [fact.id] : [],
        ),
      ),
    ),
  ];
  const resume = renderResume(bank, draft, locale, jobSkillIds);
  const orderedEntries = (section: "experiences" | "projects") => {
    const order = new Map(resume[section].map(({ factId }, index) => [factId, index]));
    return draft[section]
      .map((entry, entryIndex) => ({ entry, entryIndex }))
      .sort((a, b) => (order.get(a.entry.factId) ?? order.size) - (order.get(b.entry.factId) ?? order.size));
  };
  const relevant = (prefix: (string | number)[]) =>
    violations.filter(({ path }) => prefix.every((part, i) => path[i] === part));
  function exportPdf() {
    if (violations.length) return;
    const previousTitle = document.title;
    const previousLang = document.documentElement.lang;
    const restoreTitle = () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLang;
      window.removeEventListener("afterprint", restoreTitle);
    };
    window.addEventListener("afterprint", restoreTitle);
    document.title = resumeT(locale, "review.pdfFilename", { name: resume.profile.fullName });
    document.documentElement.lang = locale;
    try {
      window.print();
      setExported(true);
    } catch (error) {
      restoreTitle();
      throw error;
    }
  }
  function update(next: ResumeDraft) {
    const value = { ...saved, draft: next };
    setSaved(value);
    setStorageError(!saveDraft(value));
  }
  const date = (month: string) => `${month.slice(5, 7)}/${month.slice(0, 4)}`;
  function period(value?: { start: string; end: string | null }) {
    if (!value) return null;
    return `${date(value.start)} – ${value.end === null ? resumePresent(locale) : date(value.end)}`;
  }
  return (
    <section aria-busy={generation.busy} className="resume-review space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">{t("editor.step3")}</h2>
        <span role="status">
          {violations.length ? (
            // No celular a lista de violações fica abaixo do currículo: o selo leva até ela.
            <button
              type="button"
              className="min-h-10 rounded-full bg-warn-soft px-3 py-2 text-sm text-warn-ink underline-offset-4 hover:underline"
              onClick={() =>
                document.getElementById("review-violations")?.scrollIntoView({ behavior: "smooth" })
              }
            >
              {t(violations.length === 1 ? "check.one" : "check.count", {
                count: new Intl.NumberFormat(uiLocale).format(violations.length),
              })}
            </button>
          ) : (
            <span className="rounded-full bg-accent-soft px-3 py-2 text-sm text-accent-ink">
              {t("check.success")}
            </span>
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="bank-button min-h-10"
          disabled={generation.busy}
          onClick={generation.generate}
        >
          {t(generation.busy ? "generation.busy" : "review.regenerate")}
        </button>
        <button
          type="button"
          className="bank-button min-h-10"
          disabled={violations.length > 0}
          aria-describedby="pdf-help"
          onClick={exportPdf}
        >
          {t("review.pdf")}
        </button>
        <p id="pdf-help" className="text-sm text-muted">
          {t(violations.length ? "review.pdfBlocked" : "review.pdfHelp")}
        </p>
        {exported && hasSupport && (
          <p className="w-full text-sm text-muted">
            {t("review.supportAsk")}{" "}
            <button
              type="button"
              className="min-h-10 underline underline-offset-4"
              onClick={() => setSupporting(true)}
            >
              {t("support.open")}
            </button>
          </p>
        )}
        {supporting && <SupportDialog onClose={() => setSupporting(false)} />}
        {generation.controls}
      </div>
      {storageError && (
        <p role="alert" className="bank-errors">
          {t("generation.storage")}
        </p>
      )}
      <div className="resume-layout grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <article
          lang={locale}
          aria-label={t("check.preview")}
          className="resume-paper min-w-0 space-y-5 rounded-lg bg-[var(--paper)] p-5 text-[var(--paper-ink)] [color-scheme:light] sm:p-10"
        >
          <header className="space-y-2 border-b border-line pb-5">
            <h1 className="font-display text-2xl font-semibold">{resume.profile.fullName}</h1>
            {draft.headline ? (
              <EditableText
                key={`headline-${draft.headline.text}`}
                text={resume.headline ?? ""}
                label={resumeT(locale, "field.headline")}
                violations={relevant(["headline"])}
                disabled={generation.busy}
                onSave={(text) => update({ ...draft, headline: { ...draft.headline!, text } })}
                onRemove={() => {
                  const { headline, ...next } = draft;
                  update(next);
                }}
              />
            ) : (
              <p>{resume.headline}</p>
            )}
            <p className="break-words text-sm">
              {[resume.profile.email, resume.profile.phone, resume.profile.location]
                .filter((value): value is string => Boolean(value))
                .map((value, i) => (
                  <span key={i}>
                    {i > 0 && " | "}
                    {value === resume.profile.email ? <a href={`mailto:${value}`}>{value}</a> : value}
                  </span>
                ))}
            </p>
            {resume.profile.links.length > 0 && (
              <p className="break-words text-sm">
                {resume.profile.links.map((link, i) => (
                  <span key={i}>
                    {i > 0 && " | "}
                    <a
                      className="underline underline-offset-2"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {shortUrl(link.url)}
                    </a>
                  </span>
                ))}
              </p>
            )}
          </header>
          {draft.summary && (
            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">{resumeT(locale, "resume.summary")}</h2>
              <EditableText
                key={draft.summary.text}
                text={resume.summary ?? ""}
                label={resumeT(locale, "resume.summary")}
                violations={relevant(["summary"])}
                disabled={generation.busy}
                onSave={(text) => update({ ...draft, summary: { ...draft.summary!, text } })}
                onRemove={() => {
                  const { summary, ...next } = draft;
                  update(next);
                }}
              />
            </section>
          )}
          {(["experiences", "projects"] as const)
            .filter((section) => draft[section].length > 0)
            .map((section) => (
              <section key={section} className="space-y-4">
                <h4 className="font-display text-lg font-semibold">{resumeT(locale, `resume.${section}`)}</h4>
                {orderedEntries(section).map(({ entry, entryIndex }) => {
                  const experience =
                    section === "experiences"
                      ? resume.experiences.find((e) => e.factId === entry.factId)
                      : undefined;
                  const project =
                    section === "projects"
                      ? resume.projects.find((e) => e.factId === entry.factId)
                      : undefined;
                  return (
                    <div key={`${entryIndex}-${entry.factId}`} className="resume-entry space-y-2">
                      <h5 className="font-semibold">
                        {experience ? (
                          experience.role
                        ) : project ? (
                          [project.name, project.role].filter(Boolean).join(" · ")
                        ) : (
                          <span className="print:hidden">{entry.factId}</span>
                        )}
                      </h5>
                      {experience && (
                        <p className="text-sm">
                          {[experience.company, experience.location, period(experience.period)]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {project && (project.period || project.url || project.repositoryUrl) && (
                        <p className="break-words text-sm">
                          {period(project.period)}
                          {[project.url, project.repositoryUrl].filter(Boolean).map((url, i) => (
                            <span key={url}>
                              {(i > 0 || project.period) && " · "}
                              <a
                                className="underline underline-offset-2"
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {shortUrl(url!)}
                              </a>
                            </span>
                          ))}
                        </p>
                      )}
                      <ul className="list-disc space-y-2 pl-5">
                        {entry.bullets.map((bullet, bulletIndex) => (
                          <li key={bulletIndex}>
                            <EditableText
                              key={`${bullet.text}-${bullet.sourceFactIds.join(",")}`}
                              text={bullet.text}
                              label={resumeT(locale, "review.bullet", {
                                count: bulletIndex + 1,
                                id: entry.factId,
                              })}
                              violations={[
                                ...relevant([section, entryIndex, "bullets", bulletIndex]),
                                ...relevant([section, entryIndex, "factId"]),
                              ]}
                              disabled={generation.busy}
                              onSave={(text) =>
                                update({
                                  ...draft,
                                  [section]: draft[section].map((item, i) =>
                                    i === entryIndex
                                      ? {
                                          ...item,
                                          bullets: item.bullets.map((b, j) =>
                                            j === bulletIndex ? { ...b, text } : b,
                                          ),
                                        }
                                      : item,
                                  ),
                                })
                              }
                              onRemove={() =>
                                update({
                                  ...draft,
                                  [section]: draft[section].map((item, i) =>
                                    i === entryIndex
                                      ? { ...item, bullets: item.bullets.filter((_, j) => j !== bulletIndex) }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </section>
            ))}
          {resume.education.length > 0 && (
            <section className="space-y-3">
              <h4 className="font-display text-lg font-semibold">{resumeT(locale, "resume.education")}</h4>
              {resume.education.map((education, i) => (
                <div key={`${i}-${education.factId}`} className="resume-entry">
                  <h5 className="font-semibold">
                    {education.title} — {education.institution}
                  </h5>
                  <p>
                    {[
                      period(education.period),
                      education.status !== "completed"
                        ? `(${resumeT(locale, `resume.${education.status}`)})`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                </div>
              ))}
            </section>
          )}
          {resume.certifications.length > 0 && (
            <section>
              <h4 className="font-display text-lg font-semibold">
                {resumeT(locale, "resume.certifications")}
              </h4>
              {resume.certifications.map((item, i) => (
                <p key={`${i}-${item.factId}`} className="resume-entry">
                  {item.title} — {item.institution}
                  {item.period && ` · ${date(item.period.end ?? item.period.start)}`}
                </p>
              ))}
            </section>
          )}
          {resume.skills.length > 0 && (
            <section>
              <h4 className="font-display text-lg font-semibold">{resumeT(locale, "resume.skills")}</h4>
              {resume.skillGroups.map((group) => (
                <p key={group.category}>
                  {resume.skillGroups.length > 1 &&
                    `${resumeT(locale, `resume.category.${group.category}`)}: `}
                  {group.skills.map((skill) => skill.name).join(", ")}
                </p>
              ))}
            </section>
          )}
          {resume.languages.length > 0 && (
            <section>
              <h4 className="font-display text-lg font-semibold">{resumeT(locale, "resume.languages")}</h4>
              <p>
                {resume.languages
                  .map(
                    (language) =>
                      language.name +
                      (language.level ? ` (${resumeT(locale, `resume.${language.level}`)})` : ""),
                  )
                  .join(", ")}
              </p>
            </section>
          )}
        </article>
        <aside className="bank-card space-y-3" aria-labelledby="review-violations">
          <h3 id="review-violations" className="font-display text-lg font-semibold">
            {t("check.violations")}
          </h3>
          <div aria-live="polite">
            {violations.length ? (
              <ul className="space-y-3">
                {violations.map((violation, index) => (
                  <li
                    key={index}
                    className="break-words rounded-lg border border-warn-line bg-warn-soft p-3 text-sm text-warn-ink"
                  >
                    <p>{tViolation(violation)}</p>
                    <p className="mt-2 break-words text-xs">{describePath(violation.path, t, bank)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t("check.success")}</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

export default function ReviewStep({ bank }: { bank: FactBank }) {
  const { t } = useI18n();
  const [initial] = useState(loadDraft);
  if (!initial)
    return (
      <section className="bank-card space-y-4">
        <p>{t("review.missing")}</p>
        <a className="bank-button min-h-10" href="#/vaga">
          {t("editor.step2")}
        </a>
      </section>
    );
  return <Review bank={bank} initial={initial} />;
}

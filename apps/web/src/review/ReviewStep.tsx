import { useState } from "react";
import {
  checkResumeDraft,
  renderResume,
  type FactBank,
  type ResumeDraft,
  type Violation,
} from "@encaixe/core";
import { resumePresent, useI18n } from "../i18n";
import { highlight } from "../highlight";
import { loadDraft, saveDraft, useGeneration, type SavedDraft } from "../generation";

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
    <div className={`break-words rounded-lg border p-3 ${badSource ? "border-warn-line" : "border-line"}`}>
      {editing ? (
        <form
          className="space-y-2"
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
          <p className="whitespace-pre-wrap">{highlight(text, violations)}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
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

function Review({ bank, initial }: { bank: FactBank; initial: SavedDraft }) {
  const { t, locale: uiLocale, tViolation } = useI18n();
  const [saved, setSaved] = useState(initial);
  const [storageError, setStorageError] = useState(false);
  const { draft, locale, jobText } = saved;
  const generation = useGeneration(bank, jobText, locale, (value) => {
    setSaved(value);
    setStorageError(false);
  });
  const violations = checkResumeDraft(bank, draft);
  const resume = renderResume(bank, draft, locale);
  const relevant = (prefix: (string | number)[]) =>
    violations.filter(({ path }) => prefix.every((part, i) => path[i] === part));
  function update(next: ResumeDraft) {
    const value = { ...saved, draft: next };
    setSaved(value);
    setStorageError(!saveDraft(value));
  }
  function period(value?: { start: string; end: string | null }) {
    if (!value) return null;
    const date = (month: string) =>
      new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(
        new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1),
      );
    return `${date(value.start)} – ${value.end === null ? resumePresent(locale) : date(value.end)}`;
  }
  return (
    <section aria-busy={generation.busy} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">{t("editor.step3")}</h2>
        <span
          role="status"
          className={`rounded-full px-3 py-2 text-sm ${violations.length ? "bg-warn-soft text-warn-ink" : "bg-accent-soft text-accent-ink"}`}
        >
          {violations.length
            ? t(violations.length === 1 ? "check.one" : "check.count", {
                count: new Intl.NumberFormat(uiLocale).format(violations.length),
              })
            : t("check.success")}
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
        <button type="button" className="bank-button min-h-10" disabled aria-describedby="pdf-help">
          {t("review.pdf")}
        </button>
        <p id="pdf-help" className="text-sm text-muted">
          {t(violations.length ? "review.pdfBlocked" : "editor.soon")}
        </p>
        {generation.controls}
      </div>
      {storageError && (
        <p role="alert" className="bank-errors">
          {t("generation.storage")}
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <article
          lang={locale}
          aria-label={t("check.preview")}
          className="min-w-0 space-y-5 rounded-lg bg-[var(--paper)] p-5 text-[var(--paper-ink)] [color-scheme:light] sm:p-10"
        >
          <header className="space-y-2 border-b border-line pb-5">
            <h3 className="font-display text-2xl font-semibold">{resume.profile.fullName}</h3>
            <p className="break-words text-sm">
              {[resume.profile.email, resume.profile.phone, resume.profile.location]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {draft.headline ? (
              <EditableText
                key={`headline-${draft.headline.text}`}
                text={resume.headline ?? ""}
                label={t("field.headline")}
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
          </header>
          {draft.summary && (
            <EditableText
              key={draft.summary.text}
              text={resume.summary ?? ""}
              label={t("field.summary")}
              violations={relevant(["summary"])}
              disabled={generation.busy}
              onSave={(text) => update({ ...draft, summary: { ...draft.summary!, text } })}
              onRemove={() => {
                const { summary, ...next } = draft;
                update(next);
              }}
            />
          )}
          {(["experiences", "projects"] as const).map((section) => (
            <section key={section} className="space-y-4">
              <h4 className="font-display text-lg font-semibold">
                {t(section === "experiences" ? "editor.experience" : "editor.project")}
              </h4>
              {draft[section].map((entry, entryIndex) => {
                const experience =
                  section === "experiences"
                    ? resume.experiences.find((e) => e.factId === entry.factId)
                    : undefined;
                const project =
                  section === "projects" ? resume.projects.find((e) => e.factId === entry.factId) : undefined;
                const source = experience ?? project;
                return (
                  <div key={`${entryIndex}-${entry.factId}`} className="space-y-2">
                    <h5 className="font-semibold">
                      {experience
                        ? `${experience.role} · ${experience.company}`
                        : project
                          ? [project.name, project.role].filter(Boolean).join(" · ")
                          : entry.factId}
                    </h5>
                    {source?.period && <p className="text-sm">{period(source.period)}</p>}
                    <ul className="space-y-2">
                      {entry.bullets.map((bullet, bulletIndex) => (
                        <li key={bulletIndex}>
                          <EditableText
                            key={`${bullet.text}-${bullet.sourceFactIds.join(",")}`}
                            text={bullet.text}
                            label={t("review.bullet", {
                              count: new Intl.NumberFormat(uiLocale).format(bulletIndex + 1),
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
          {resume.skills.length > 0 && (
            <section>
              <h4 className="font-display text-lg font-semibold">{t("editor.skill")}</h4>
              <p>{resume.skills.map((skill) => skill.name).join(" · ")}</p>
            </section>
          )}
          {resume.education.length > 0 && (
            <section className="space-y-3">
              <h4 className="font-display text-lg font-semibold">{t("editor.education")}</h4>
              {resume.education.map((education, i) => (
                <div key={`${i}-${education.factId}`}>
                  <h5 className="font-semibold">
                    {education.title} · {education.institution}
                  </h5>
                  <p>{period(education.period)}</p>
                </div>
              ))}
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
                    <p className="mt-2 break-all font-mono text-xs">{violation.path.join(".")}</p>
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

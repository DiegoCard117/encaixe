import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { FactBankSchema, createEmptyFactBank, referencesTo, type Fact, type FactKind } from "@encaixe/core";
import { sampleBank } from "@encaixe/core/fixtures";
import { useI18n } from "../i18n";
import { describePath } from "../paths";
import { loadBank, saveBank } from "./storage";
import { download, Errors, factTitle, Modal } from "./ui";
import ProfileForm from "./ProfileForm";
import FactForm from "./FactForm";
import ImportResume from "./ImportResume";
import { useSync } from "../sync/useSync";
import SyncCard from "../sync/SyncCard";
import DangerZone from "./DangerZone";

type Editing = { kind: "profile" } | { kind: FactKind; fact?: Fact; contextId?: string };
export default function BankEditor({ onSaved }: { onSaved: (saved: boolean) => void }) {
  const { t, tIssue, locale } = useI18n();
  const [stored, setStored] = useState(loadBank);
  const bank = stored.status === "ok" ? stored.bank : undefined;
  const [editing, setEditing] = useState<Editing>();
  const [importingResume, setImportingResume] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expandedAchievements, setExpandedAchievements] = useState<Record<string, boolean>>({});
  const sections = useRef<Partial<Record<FactKind, HTMLElement | null>>>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const sync = useSync((pulled) => {
    setStored({ status: "ok", bank: pulled });
    setSaveFailed(false);
  });
  const [blocked, setBlocked] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onSaved(stored.status === "ok" && !saveFailed);
  }, [stored, saveFailed, onSaved]);

  function commit(candidate: unknown): string[] {
    if (stored.status === "invalid") return [t("editor.invalid")];
    const result = FactBankSchema.safeParse(candidate);
    if (!result.success)
      return result.error.issues.map(
        (issue) => `${describePath(issue.path, t, candidate)}: ${tIssue(issue)}`,
      );
    const saved = saveBank(result.data);
    if (saved) sync.afterLocalSave(result.data);
    setStored({ status: "ok", bank: result.data });
    setSaveFailed(!saved);
    setErrors([]);
    setBlocked([]);
    return [];
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    let raw: string;
    try {
      raw = await file.text();
    } catch {
      setErrors([t("editor.readError")]);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setErrors([t("draft.invalidJson")]);
      return;
    }
    const result = FactBankSchema.safeParse(parsed);
    if (!result.success) {
      setErrors(
        result.error.issues.map((issue) => `${describePath(issue.path, t, parsed)}: ${tIssue(issue)}`),
      );
      return;
    }
    if (bank && !window.confirm(t("editor.replace"))) return;
    setErrors(commit(result.data));
  }

  function remove(fact: Fact) {
    if (!bank) return;
    const refs = referencesTo(bank, fact.id);
    if (refs.length) {
      setBlocked(refs);
      setErrors([]);
      return;
    }
    if (window.confirm(t("editor.deleteConfirm", { id: fact.id }))) {
      const issues = commit({ ...bank, facts: bank.facts.filter((f) => f.id !== fact.id) });
      setErrors(issues);
      if (!issues.length) setEditing(undefined);
    }
  }

  function factCard(fact: Fact, nested = false) {
    const achievements = bank?.facts.filter((f) => f.kind === "achievement" && f.contextId === fact.id) ?? [];
    return (
      <article
        className={
          nested
            ? "ml-3 min-w-0 border-l border-line pl-3"
            : "min-w-0 rounded-xl border border-line bg-surface p-4"
        }
        key={fact.id}
      >
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="min-w-0 break-words font-display font-medium [overflow-wrap:anywhere]">
            {factTitle(fact)}
          </h4>
          {fact.archived && (
            <span className="rounded-full bg-accent-soft px-2 py-1 text-xs text-accent-ink">
              {t("editor.archived")}
            </span>
          )}
        </div>
        {"period" in fact && fact.period && (
          <p className="mt-2 text-sm text-muted">
            {new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(
              new Date(`${fact.period.start}-01T00:00:00Z`),
            )}
            {" – "}
            {fact.period.end === null
              ? t("editor.current")
              : new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(
                  new Date(`${fact.period.end}-01T00:00:00Z`),
                )}
          </p>
        )}
        {fact.kind === "project" && (
          <p className="mt-1 line-clamp-2 break-words text-sm text-muted [overflow-wrap:anywhere]">
            {fact.description}
          </p>
        )}
        {fact.kind === "experience" && fact.summary && (
          <p className="mt-1 line-clamp-2 break-words text-sm text-muted [overflow-wrap:anywhere]">
            {fact.summary}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="bank-button"
            aria-label={`${t("editor.edit")} · ${factTitle(fact)}`}
            onClick={() => setEditing({ kind: fact.kind, fact })}
          >
            {t("editor.edit")}
          </button>
          {fact.kind !== "skill" && fact.kind !== "achievement" && (
            <button
              type="button"
              className="bank-button text-accent-ink"
              aria-label={`${t("editor.addAchievement")} · ${factTitle(fact)}`}
              onClick={() => setEditing({ kind: "achievement", contextId: fact.id })}
            >
              {t("editor.addAchievement")}
            </button>
          )}
        </div>
        {achievements.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              className="min-h-10 text-sm text-muted"
              aria-expanded={!!expandedAchievements[fact.id]}
              aria-label={`${t("editor.achievementCount", { count: achievements.length })} · ${factTitle(fact)}`}
              onClick={() =>
                setExpandedAchievements((current) => ({ ...current, [fact.id]: !current[fact.id] }))
              }
            >
              {t("editor.achievementCount", { count: achievements.length })}
            </button>
            {expandedAchievements[fact.id] && (
              <div className="mt-2 space-y-3">
                {achievements.map((achievement) => factCard(achievement, true))}
              </div>
            )}
          </div>
        )}
      </article>
    );
  }

  if (stored.status === "invalid")
    return (
      <section className="bank-card space-y-4" aria-labelledby="invalid-bank-title">
        <h2 id="invalid-bank-title" className="font-display text-xl">
          {t("bank.title")}
        </h2>
        <p role="alert" className="text-warn-ink">
          {t("editor.invalid")}
        </p>
        <Errors errors={errors} />
        <div className="flex flex-wrap gap-2">
          <button
            className="bank-button"
            type="button"
            onClick={() => download(stored.raw, "encaixe.bank.raw.json")}
          >
            {t("editor.raw")}
          </button>
          <button
            className="bank-button"
            type="button"
            onClick={() => {
              if (!window.confirm(t("editor.restartConfirm"))) return;
              try {
                localStorage.removeItem("encaixe.bank");
                setStored({ status: "empty" });
                setErrors([]);
              } catch {
                setErrors([t("editor.storageError")]);
              }
            }}
          >
            {t("editor.restart")}
          </button>
        </div>
      </section>
    );

  return (
    <>
      <input
        ref={input}
        id="bank-json-file"
        type="file"
        accept="application/json,.json"
        className="sr-only"
        tabIndex={-1}
        aria-label={t("editor.import")}
        onChange={(event) => {
          void importFile(event);
        }}
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold">{t(bank ? "bank.title" : "editor.welcome")}</h2>
          <p className="mt-2 text-sm text-muted">{t("editor.intro")}</p>
        </div>
        {bank && (
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button
              type="button"
              className="bank-button"
              onClick={() => download(JSON.stringify(bank, null, 2), "encaixe.bank.json")}
            >
              {t("editor.export")}
            </button>
            <button type="button" className="bank-button" onClick={() => input.current?.click()}>
              {t("editor.import")}
            </button>
            <button type="button" className="bank-button" onClick={() => setImportingResume(true)}>
              {t("import.title")}
            </button>
            <button type="button" className="bank-button" onClick={() => setSettingsOpen(true)}>
              {t("editor.settings")}
            </button>
          </div>
        )}
      </div>
      <Errors errors={errors} />
      {saveFailed && (
        <p role="alert" className="bank-errors mb-5">
          {t("editor.storageError")}
        </p>
      )}
      {blocked.length > 0 && (
        <div role="alert" className="bank-errors mb-5">
          <p>{t("editor.blocked")}</p>
          <ul>
            {blocked.map((id) => (
              <li key={id}>
                <span className="font-mono">{id}</span> ·{" "}
                {bank?.facts.find((f) => f.id === id) && factTitle(bank.facts.find((f) => f.id === id)!)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!bank ? (
        <>
          <div className="grid gap-5 md:grid-cols-3">
            <section className="bank-card flex flex-col gap-4">
              <h3 className="font-display text-lg">{t("editor.start")}</h3>
              <p className="flex-1 text-sm text-muted">{t("editor.startHelp")}</p>
              <button
                className="bank-button bg-accent-soft text-accent-ink"
                type="button"
                onClick={() => setEditing({ kind: "profile" })}
              >
                {t("editor.start")}
              </button>
            </section>
            <section className="bank-card flex flex-col gap-4">
              <h3 className="font-display text-lg">{t("editor.import")}</h3>
              <p className="flex-1 text-sm text-muted">{t("editor.importHelp")}</p>
              <button className="bank-button" type="button" onClick={() => input.current?.click()}>
                {t("editor.import")}
              </button>
            </section>
            <section className="bank-card flex flex-col gap-4">
              <h3 className="font-display text-lg">{t("editor.old")}</h3>
              <p className="flex-1 text-sm text-muted">{t("editor.oldHelp")}</p>
              <button className="bank-button" type="button" onClick={() => setImportingResume(true)}>
                {t("import.title")}
              </button>
            </section>
          </div>
          <button
            className="mt-4 min-h-10 text-sm text-muted underline underline-offset-4"
            type="button"
            onClick={() => setErrors(commit(sampleBank))}
          >
            {t("editor.example")}
          </button>
          <div className="mt-5">
            <SyncCard sync={sync} />
          </div>
        </>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.5fr)]">
          <aside className="min-w-0">
            <section className="space-y-1 rounded-xl border border-line bg-surface p-4">
              <h3 className="break-words font-display text-lg font-semibold [overflow-wrap:anywhere]">
                {bank.profile.fullName}
              </h3>
              {bank.profile.headline && (
                <p className="break-words text-sm [overflow-wrap:anywhere]">{bank.profile.headline}</p>
              )}
              <div className="break-words text-sm text-muted [overflow-wrap:anywhere]">
                {[bank.profile.email, bank.profile.phone, bank.profile.location].filter(Boolean).join(" · ")}
                {bank.profile.links.map((link, i) => (
                  <span key={i}>
                    {(i > 0 || bank.profile.email || bank.profile.phone || bank.profile.location) && " · "}
                    <a
                      className="inline-flex min-h-10 max-w-full items-center text-accent-ink underline"
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span className="min-w-0 break-words [overflow-wrap:anywhere]">{link.label}</span>
                    </a>
                  </span>
                ))}
              </div>
              <button type="button" className="bank-button" onClick={() => setEditing({ kind: "profile" })}>
                {t("editor.editProfile")}
              </button>
            </section>
          </aside>
          <div className="min-w-0 space-y-8">
            <div className="sticky top-0 z-10 overflow-x-auto bg-bg py-2">
              <div className="flex gap-2">
                {(["experience", "project", "education", "skill"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="bank-button shrink-0"
                    onClick={() => sections.current[kind]?.scrollIntoView({ block: "start" })}
                  >
                    {t(`editor.${kind}`)} · {bank.facts.filter((fact) => fact.kind === kind).length}
                  </button>
                ))}
              </div>
            </div>
            {(["experience", "project", "education", "skill"] as const).map((kind) => (
              <section
                key={kind}
                ref={(element) => {
                  sections.current[kind] = element;
                }}
                className="scroll-mt-20"
                aria-labelledby={`section-${kind}`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 id={`section-${kind}`} className="font-display text-xl font-semibold">
                    {t(`editor.${kind}`)}
                  </h3>
                  <button
                    type="button"
                    className="bank-button"
                    aria-label={`${t("editor.add")} · ${t(`editor.${kind}`)}`}
                    onClick={() => setEditing({ kind })}
                  >
                    {t("editor.add")}
                  </button>
                </div>
                <div className={kind === "skill" ? "flex flex-wrap gap-2" : "space-y-3"}>
                  {bank.facts.some((f) => f.kind === kind) ? (
                    bank.facts
                      .filter((f) => f.kind === kind)
                      .map((fact) =>
                        kind === "skill" ? (
                          <button
                            key={fact.id}
                            type="button"
                            className={`min-h-10 max-w-full break-words rounded-full border border-line px-3 text-sm [overflow-wrap:anywhere] ${fact.archived ? "border-dashed opacity-60" : ""}`}
                            aria-label={`${t("editor.edit")} · ${factTitle(fact)}${fact.archived ? ` · ${t("editor.archived")}` : ""}`}
                            onClick={() => setEditing({ kind: "skill", fact })}
                          >
                            {factTitle(fact)}
                          </button>
                        ) : (
                          factCard(fact)
                        ),
                      )
                  ) : (
                    <p className="bank-card text-sm text-muted">{t("editor.empty")}</p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
      {bank && settingsOpen && (
        <Modal title={t("editor.settings")} onClose={() => setSettingsOpen(false)}>
          <div className="space-y-5">
            <SyncCard sync={sync} />
            <DangerZone bank={bank} />
          </div>
        </Modal>
      )}
      {importingResume && (
        <ImportResume bank={bank} onSave={commit} onClose={() => setImportingResume(false)} />
      )}
      {editing && (
        <Modal
          title={t(
            editing.kind === "profile"
              ? "editor.profile"
              : editing.fact
                ? "editor.editFact"
                : "editor.newFact",
          )}
          onClose={() => setEditing(undefined)}
        >
          {editing.kind === "profile" ? (
            <ProfileForm
              profile={bank?.profile}
              bankLocale={bank?.locale ?? locale}
              onCancel={() => setEditing(undefined)}
              onSave={(profile, resumeLocale) => {
                const next = bank
                  ? { ...bank, profile, locale: resumeLocale }
                  : { ...createEmptyFactBank(profile), locale: resumeLocale };
                const issues = commit(next);
                if (!issues.length) setEditing(undefined);
                return issues;
              }}
            />
          ) : (
            bank && (
              <>
                <FactForm
                  bank={bank}
                  kind={editing.kind}
                  fact={editing.fact}
                  contextId={editing.contextId}
                  onCancel={() => setEditing(undefined)}
                  onSave={(fact) => {
                    const next = {
                      ...bank,
                      facts: editing.fact
                        ? bank.facts.map((f) => (f.id === fact.id ? fact : f))
                        : [...bank.facts, fact],
                    };
                    const issues = commit(next);
                    if (!issues.length) setEditing(undefined);
                    return issues;
                  }}
                />
                {editing.fact && (
                  <div className="mt-5 border-t border-line pt-4">
                    <Errors errors={errors} />
                    {blocked.length > 0 && (
                      <div role="alert" className="bank-errors">
                        <p>{t("editor.blocked")}</p>
                        <ul>
                          {blocked.map((id) => (
                            <li key={id} className="break-words [overflow-wrap:anywhere]">
                              {(() => {
                                const fact = bank.facts.find((candidate) => candidate.id === id);
                                return fact ? factTitle(fact) : id;
                              })()}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="bank-button"
                        onClick={() => {
                          const fact = editing.fact!;
                          const issues = commit({
                            ...bank,
                            facts: bank.facts.map((f) =>
                              f.id === fact.id ? { ...f, archived: !f.archived } : f,
                            ),
                          });
                          setErrors(issues);
                          if (!issues.length) setEditing(undefined);
                        }}
                      >
                        {t(editing.fact.archived ? "editor.unarchive" : "editor.archive")}
                      </button>
                      <button
                        type="button"
                        className="bank-button border-warn-line text-warn-ink"
                        onClick={() => remove(editing.fact!)}
                      >
                        {t("editor.delete")}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )
          )}
        </Modal>
      )}
    </>
  );
}

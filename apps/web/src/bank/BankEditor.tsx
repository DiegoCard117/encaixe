import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { FactBankSchema, createEmptyFactBank, referencesTo, type Fact, type FactKind } from "@encaixe/core";
import { sampleBank } from "@encaixe/core/fixtures";
import { useI18n } from "../i18n";
import { loadBank, saveBank } from "./storage";
import { download, Errors, Modal } from "./ui";
import ProfileForm from "./ProfileForm";
import FactForm from "./FactForm";

type Editing = { kind: "profile" } | { kind: FactKind; fact?: Fact; contextId?: string };
function title(fact: Fact): string {
  switch (fact.kind) {
    case "experience":
      return `${fact.role} · ${fact.company}`;
    case "achievement":
      return fact.text;
    case "education":
      return `${fact.title} · ${fact.institution}`;
    default:
      return fact.name;
  }
}

export default function BankEditor({ onSaved }: { onSaved: (saved: boolean) => void }) {
  const { t, tIssue, locale } = useI18n();
  const [stored, setStored] = useState(loadBank);
  const bank = stored.status === "ok" ? stored.bank : undefined;
  const [editing, setEditing] = useState<Editing>();
  const [errors, setErrors] = useState<string[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
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
        (issue) => `${issue.path.join(".") || t("draft.root")}: ${tIssue(issue)}`,
      );
    const saved = saveBank(result.data);
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
        result.error.issues.map((issue) => `${issue.path.join(".") || t("draft.root")}: ${tIssue(issue)}`),
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
      setErrors(commit({ ...bank, facts: bank.facts.filter((f) => f.id !== fact.id) }));
    }
  }

  function factCard(fact: Fact, nested = false) {
    return (
      <article className={nested ? "bank-card mt-3 bg-bg" : "bank-card"} key={fact.id}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-all font-mono text-xs text-accent-ink">{fact.id}</p>
          {fact.archived && (
            <span className="rounded-full bg-accent-soft px-2 py-1 text-xs text-accent-ink">
              {t("editor.archived")}
            </span>
          )}
        </div>
        <h4 className="mt-2 break-words font-display font-medium">{title(fact)}</h4>
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
        {fact.kind === "project" && <p className="mt-2 break-words text-sm text-muted">{fact.description}</p>}
        {fact.kind === "experience" && fact.summary && (
          <p className="mt-2 break-words text-sm text-muted">{fact.summary}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="bank-button"
            aria-label={`${t("editor.edit")} · ${fact.id}`}
            onClick={() => setEditing({ kind: fact.kind, fact })}
          >
            {t("editor.edit")}
          </button>
          <button
            type="button"
            className="bank-button"
            aria-label={`${t(fact.archived ? "editor.unarchive" : "editor.archive")} · ${fact.id}`}
            onClick={() =>
              bank &&
              setErrors(
                commit({
                  ...bank,
                  facts: bank.facts.map((f) => (f.id === fact.id ? { ...f, archived: !f.archived } : f)),
                }),
              )
            }
          >
            {t(fact.archived ? "editor.unarchive" : "editor.archive")}
          </button>
          <button
            type="button"
            className="bank-button"
            aria-label={`${t("editor.delete")} · ${fact.id}`}
            onClick={() => remove(fact)}
          >
            {t("editor.delete")}
          </button>
          {fact.kind !== "skill" && fact.kind !== "achievement" && (
            <button
              type="button"
              className="bank-button text-accent-ink"
              aria-label={`${t("editor.addAchievement")} · ${fact.id}`}
              onClick={() => setEditing({ kind: "achievement", contextId: fact.id })}
            >
              {t("editor.addAchievement")}
            </button>
          )}
        </div>
        {bank?.facts
          .filter((f) => f.kind === "achievement" && f.contextId === fact.id)
          .map((achievement) => factCard(achievement, true))}
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
          <div className="flex flex-wrap gap-2">
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
                {bank?.facts.find((f) => f.id === id) && title(bank.facts.find((f) => f.id === id)!)}
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
              <button className="bank-button" type="button" disabled aria-disabled="true">
                {t("editor.soon")}
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
        </>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.5fr)]">
          <aside className="space-y-5">
            <section className="bank-card space-y-3">
              <h3 className="font-display text-lg font-semibold">{bank.profile.fullName}</h3>
              {bank.profile.headline && <p className="break-words">{bank.profile.headline}</p>}
              {[bank.profile.email, bank.profile.phone, bank.profile.location]
                .filter(Boolean)
                .map((value, index) => (
                  <p key={index} className="break-words text-sm text-muted">
                    {value}
                  </p>
                ))}
              {bank.profile.links.map((link, i) => (
                <a
                  className="block min-h-10 break-words text-sm text-accent-ink underline"
                  key={i}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {link.label}
                </a>
              ))}
              <button type="button" className="bank-button" onClick={() => setEditing({ kind: "profile" })}>
                {t("editor.editProfile")}
              </button>
            </section>
            <section className="bank-card space-y-3">
              <h3 className="font-display font-semibold">{t("editor.remote")}</h3>
              <p className="text-sm text-muted">{t("editor.remoteHelp")}</p>
              <button className="bank-button" type="button" disabled aria-disabled="true">
                {t("editor.soon")}
              </button>
            </section>
          </aside>
          <div className="min-w-0 space-y-8">
            {(["experience", "project", "education", "skill"] as const).map((kind) => (
              <section key={kind} aria-labelledby={`section-${kind}`}>
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
                <div className="space-y-3">
                  {bank.facts.some((f) => f.kind === kind) ? (
                    bank.facts.filter((f) => f.kind === kind).map((fact) => factCard(fact))
                  ) : (
                    <p className="bank-card text-sm text-muted">{t("editor.empty")}</p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
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
            )
          )}
        </Modal>
      )}
    </>
  );
}

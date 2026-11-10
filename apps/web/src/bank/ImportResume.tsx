/// <reference types="vite/client" />
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  buildExtractionPrompt,
  checkExtractedFact,
  createEmptyFactBank,
  mergeExtraction,
  parseExtraction,
  ProfileSchema,
  FactSchema,
  type Extraction,
  type Fact,
  type FactBank,
  type SkillFact,
} from "@encaixe/core";
import { useLlmTask } from "../generation";
import { useI18n, type TranslationKey } from "../i18n";
import FactForm from "./FactForm";
import ProfileForm from "./ProfileForm";
import { Errors, factTitle, Modal } from "./ui";

type Status = "pending" | "confirmed" | "discarded";
type SavedReview = {
  text: string;
  sourceText: string;
  extraction: Extraction;
  dropped: number;
  statuses: Record<string, Status>;
  profileStatus: Status;
  hasEdits: boolean;
};
const reviewKey = "encaixe.import";
const isStatus = (value: unknown): value is Status =>
  value === "pending" || value === "confirmed" || value === "discarded";

function clearReview() {
  try {
    localStorage.removeItem(reviewKey);
  } catch {
    /* Storage may be unavailable. */
  }
}

function loadReview(): SavedReview | undefined {
  try {
    const raw = localStorage.getItem(reviewKey);
    if (raw === null) return;
    const value = JSON.parse(raw);
    if (
      !value ||
      typeof value.text !== "string" ||
      typeof value.sourceText !== "string" ||
      !Number.isInteger(value.dropped) ||
      value.dropped < 0 ||
      !value.extraction ||
      !Array.isArray(value.extraction.facts) ||
      (value.extraction.locale !== "pt-BR" && value.extraction.locale !== "en") ||
      !value.statuses ||
      typeof value.statuses !== "object" ||
      Array.isArray(value.statuses) ||
      !Object.values(value.statuses).every(isStatus) ||
      !isStatus(value.profileStatus) ||
      (value.hasEdits !== undefined && typeof value.hasEdits !== "boolean")
    ) {
      clearReview();
      return;
    }
    const profile = ProfileSchema.safeParse(value.extraction.profile);
    if (!profile.success) {
      clearReview();
      return;
    }
    const facts: Fact[] = [];
    for (const input of value.extraction.facts) {
      const fact = FactSchema.safeParse(input);
      if (!fact.success) {
        clearReview();
        return;
      }
      facts.push(fact.data);
    }
    return {
      text: value.text,
      sourceText: value.sourceText,
      extraction: { profile: profile.data, facts, locale: value.extraction.locale },
      dropped: value.dropped,
      statuses: value.statuses,
      profileStatus: value.profileStatus,
      hasEdits: value.hasEdits ?? false,
    };
  } catch {
    clearReview();
  }
}

export default function ImportResume({
  bank,
  onSave,
  onClose,
}: {
  bank?: FactBank;
  onSave: (bank: FactBank) => string[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const llm = useLlmTask();
  const fileInput = useRef<HTMLInputElement>(null);
  const [restored] = useState(loadReview);
  const [text, setText] = useState(restored?.text ?? "");
  const [sourceText, setSourceText] = useState(restored?.sourceText ?? "");
  const [reading, setReading] = useState(false);
  const [extraction, setExtraction] = useState<Extraction | undefined>(restored?.extraction);
  const [dropped, setDropped] = useState(restored?.dropped ?? 0);
  const [statuses, setStatuses] = useState<Record<string, Status>>(restored?.statuses ?? {});
  const [profileStatus, setProfileStatus] = useState<Status>(restored?.profileStatus ?? "pending");
  const [hasEdits, setHasEdits] = useState(restored?.hasEdits ?? false);
  useEffect(() => {
    if (!extraction) return;
    try {
      localStorage.setItem(
        reviewKey,
        JSON.stringify({
          text,
          sourceText,
          extraction,
          dropped,
          statuses,
          profileStatus,
          hasEdits,
        }),
      );
    } catch {
      /* Review still works without storage. */
    }
  }, [text, sourceText, extraction, dropped, statuses, profileStatus, hasEdits]);
  const [editing, setEditing] = useState<Fact | "profile">();
  const [errors, setErrors] = useState<string[]>([]);
  const busy = llm.busy || reading;

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setReading(true);
    setErrors([]);
    llm.setError(undefined);
    try {
      let content: string;
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const loading = pdfjs.getDocument({ data: await file.arrayBuffer() });
        try {
          const pdf = await loading.promise;
          const pages: string[] = [];
          for (let number = 1; number <= pdf.numPages; number++) {
            const page = await pdf.getPage(number);
            const content = await page.getTextContent();
            pages.push(
              content.items
                .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""))
                .join(""),
            );
          }
          content = pages.join("\n");
        } finally {
          await loading.destroy();
        }
        if (!content.trim()) {
          setErrors([t("import.pdfNoText")]);
          return;
        }
      } else {
        content = await file.text();
      }
      setText(content);
    } catch {
      setErrors([t("import.readError")]);
    } finally {
      setReading(false);
    }
  }

  function extract() {
    if (busy || !text.trim()) return;
    setErrors([]);
    llm.run(async (callLlm) => {
      const parsed = parseExtraction(await callLlm(buildExtractionPrompt({ resumeText: text })));
      if (!parsed.ok) {
        llm.setError(`generation.${parsed.error}`);
        return;
      }
      const merged = mergeExtraction(bank, parsed.extraction);
      setExtraction(merged);
      setSourceText(text);
      setDropped(parsed.dropped);
      setStatuses(Object.fromEntries(merged.facts.map((fact) => [fact.id, "pending"])));
      setProfileStatus("pending");
      setHasEdits(false);
    });
  }

  const facts = extraction?.facts ?? [];
  const temporaryBank: FactBank | undefined = extraction
    ? {
        ...(bank ?? { ...createEmptyFactBank(extraction.profile), locale: extraction.locale }),
        facts: [...(bank?.facts ?? []), ...facts.filter((fact) => statuses[fact.id] !== "discarded")],
      }
    : undefined;
  const skills = new Map<string, SkillFact>();
  for (const fact of [...(bank?.facts ?? []), ...facts]) if (fact.kind === "skill") skills.set(fact.id, fact);
  const alerts = new Map(facts.map((fact) => [fact.id, checkExtractedFact(sourceText, fact, skills)]));
  const parentOf = (fact: Fact) =>
    "contextId" in fact && fact.contextId
      ? temporaryBank?.facts.find((parent) => parent.id === fact.contextId)
      : undefined;
  function canConfirm(fact: Fact, states = statuses): boolean {
    if (!("contextId" in fact) || !fact.contextId) return true;
    return (
      !!bank?.facts.some((parent) => parent.id === fact.contextId) || states[fact.contextId] === "confirmed"
    );
  }
  function discard(id: string) {
    const discarded = new Set([id]);
    let previous: number;
    do {
      previous = discarded.size;
      for (const fact of facts) {
        if ("contextId" in fact && fact.contextId && discarded.has(fact.contextId)) discarded.add(fact.id);
      }
    } while (discarded.size !== previous);
    setStatuses((current) => ({
      ...current,
      ...Object.fromEntries([...discarded].map((key) => [key, "discarded" as const])),
    }));
  }
  function confirmAll() {
    const next = { ...statuses };
    let changed: boolean;
    do {
      changed = false;
      for (const fact of facts) {
        if (next[fact.id] === "pending" && !alerts.get(fact.id)?.length && canConfirm(fact, next)) {
          next[fact.id] = "confirmed";
          changed = true;
        }
      }
    } while (changed);
    setStatuses(next);
    if (!bank && profileStatus === "pending") setProfileStatus("confirmed");
  }
  const confirmed = facts.filter((fact) => statuses[fact.id] === "confirmed");
  function save() {
    if (!extraction || (!bank && profileStatus !== "confirmed")) return;
    const base = bank ?? { ...createEmptyFactBank(extraction.profile), locale: extraction.locale };
    const includedSkills = new Set(
      [...base.facts, ...confirmed].filter((fact) => fact.kind === "skill").map((fact) => fact.id),
    );
    const issues = onSave({
      ...base,
      facts: [
        ...base.facts,
        ...confirmed.map((fact) =>
          "skillIds" in fact
            ? { ...fact, skillIds: fact.skillIds.filter((id) => includedSkills.has(id)) }
            : fact,
        ),
      ],
    });
    setErrors(issues);
    if (!issues.length) {
      clearReview();
      onClose();
    }
  }

  function actions(
    name: string,
    status: Status,
    confirm: () => void,
    edit: () => void,
    remove: () => void,
    disabled = false,
    hint?: string,
  ) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">{t(`import.${status}`)}</span>
        <span title={hint}>
          <button
            type="button"
            className="bank-button"
            disabled={disabled || status !== "pending"}
            aria-label={t("import.confirmItem", { title: name })}
            onClick={confirm}
          >
            {t("import.confirm")}
          </button>
        </span>
        <button
          type="button"
          className="bank-button"
          disabled={status === "discarded"}
          aria-label={t("import.editItem", { title: name })}
          onClick={edit}
        >
          {t("editor.edit")}
        </button>
        <button
          type="button"
          className="bank-button"
          disabled={status === "discarded"}
          aria-label={t("import.discardItem", { title: name })}
          onClick={remove}
        >
          {t("import.discard")}
        </button>
        {hint && <p className="w-full text-sm text-muted">{hint}</p>}
      </div>
    );
  }

  function factCard(fact: Fact, nested = false) {
    const name = factTitle(fact);
    const warnings = alerts.get(fact.id) ?? [];
    const parent = parentOf(fact);
    const hint =
      !canConfirm(fact) && parent ? t("import.parentFirst", { title: factTitle(parent) }) : undefined;
    return (
      <article key={fact.id} className={`bank-card space-y-3 ${nested ? "mt-3 bg-bg" : ""}`}>
        <h4 className="break-words font-display font-medium">{name}</h4>
        <dl className="space-y-2 break-words text-sm">
          {parent && (
            <div>
              <dt className="text-muted">{t("field.contextId")}</dt>
              <dd>{factTitle(parent)}</dd>
            </div>
          )}
          {Object.entries(fact)
            .filter(
              ([key, value]) =>
                !["id", "kind", "archived", "contextId"].includes(key) &&
                !(fact.kind === "achievement" && key === "text") &&
                value !== undefined &&
                (!Array.isArray(value) || value.length > 0),
            )
            .map(([key, value]) => {
              let display: string;
              if (key === "period" && "period" in fact && fact.period) {
                display = `${fact.period.start} – ${fact.period.end ?? t("editor.current")}`;
              } else if (key === "metrics" && fact.kind === "achievement") {
                display = fact.metrics
                  .map((metric) => `${metric.value}${metric.unit ?? ""} · ${metric.label}`)
                  .join("; ");
              } else if (key === "skillIds" && "skillIds" in fact) {
                display = fact.skillIds.map((id) => skills.get(id)?.name ?? id).join(", ");
              } else if (
                ["category", "level", "type", "status", "employmentType", "workMode"].includes(key)
              ) {
                display = t(`enum.${value}` as TranslationKey);
              } else {
                display = Array.isArray(value) ? value.join(", ") : String(value);
              }
              return (
                <div key={key}>
                  <dt className="text-muted">
                    {t(
                      (key === "period"
                        ? "import.period"
                        : key === "metrics"
                          ? "editor.metrics"
                          : `field.${key}`) as TranslationKey,
                    )}
                  </dt>
                  <dd className="whitespace-pre-wrap">{display}</dd>
                </div>
              );
            })}
        </dl>
        {warnings.length > 0 && (
          <p role="alert" className="rounded-lg border border-current p-3 text-sm text-warn-ink">
            {t("import.unsupported", {
              values: [...new Set(warnings.map((warning) => warning.value))].join(", "),
            })}
          </p>
        )}
        {actions(
          name,
          statuses[fact.id] ?? "pending",
          () => setStatuses({ ...statuses, [fact.id]: "confirmed" }),
          () => setEditing(fact),
          () => discard(fact.id),
          !canConfirm(fact),
          hint,
        )}
        {facts
          .filter((child) => child.kind === "achievement" && child.contextId === fact.id)
          .map((child) => factCard(child, true))}
      </article>
    );
  }

  return (
    <Modal wide title={t("import.title")} onClose={onClose}>
      {!extraction ? (
        <div className="bank-form space-y-4">
          <label>
            {t("import.text")}
            <textarea
              rows={14}
              value={text}
              disabled={busy}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <input
            ref={fileInput}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-label={t("import.file")}
            accept=".pdf,.txt,application/pdf,text/plain"
            disabled={busy}
            onChange={(event) => {
              void readFile(event);
            }}
          />
          <button
            type="button"
            className="bank-button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {t(reading ? "import.reading" : "import.file")}
          </button>
          <p className="text-sm text-muted">{t("import.privacy")}</p>
          <button
            type="button"
            className="bank-button bg-accent-soft text-accent-ink"
            disabled={busy || !text.trim()}
            onClick={extract}
          >
            {t(llm.busy ? "import.extracting" : "import.extract")}
          </button>
          {llm.controls}
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted">{t("import.review")}</p>
          {dropped > 0 && (
            <p role="status" className="text-warn-ink">
              {t("import.dropped", { count: dropped })}
            </p>
          )}
          <button type="button" className="bank-button" onClick={confirmAll}>
            {t("import.confirmAll")}
          </button>
          {!bank && (
            <section className="bank-card space-y-3">
              <h3 className="font-display text-lg">{t("editor.profile")}</h3>
              <p>{extraction.profile.fullName}</p>
              {[
                extraction.profile.headline,
                extraction.profile.email,
                extraction.profile.phone,
                extraction.profile.location,
              ]
                .filter(Boolean)
                .map((value, index) => (
                  <p key={index} className="break-words text-sm">
                    {value}
                  </p>
                ))}
              {extraction.profile.links.map((link, index) => (
                <p key={index} className="break-words text-sm">
                  {link.label}
                  {" · "}
                  {link.url}
                </p>
              ))}
              <p className="text-sm">
                {t("field.locale")}
                {": "}
                {t(`enum.${extraction.locale}`)}
              </p>
              {actions(
                extraction.profile.fullName,
                profileStatus,
                () => setProfileStatus("confirmed"),
                () => setEditing("profile"),
                () => setProfileStatus("discarded"),
              )}
            </section>
          )}
          {(["experience", "project", "education", "skill"] as const).map((kind) => (
            <section key={kind} className="space-y-3">
              <h3 className="font-display text-lg">{t(`editor.${kind}`)}</h3>
              {facts.filter((fact) => fact.kind === kind).map((fact) => factCard(fact))}
            </section>
          ))}
          <p className="text-sm text-muted">{t("import.pendingHelp")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="bank-button"
              onClick={() => {
                if (
                  (hasEdits ||
                    profileStatus === "confirmed" ||
                    Object.values(statuses).includes("confirmed")) &&
                  !window.confirm(t("import.discardReview"))
                )
                  return;
                clearReview();
                setExtraction(undefined);
                setHasEdits(false);
                setErrors([]);
                llm.setError(undefined);
              }}
            >
              {t("import.back")}
            </button>
            <button
              type="button"
              className="bank-button bg-accent-soft text-accent-ink"
              disabled={(!bank && profileStatus !== "confirmed") || (!!bank && !confirmed.length)}
              onClick={save}
            >
              {t("import.add", { count: confirmed.length })}
            </button>
          </div>
          {!bank && profileStatus !== "confirmed" && (
            <p className="text-sm text-muted">{t("import.confirmProfile")}</p>
          )}
        </div>
      )}
      <Errors errors={errors} />
      {editing && extraction && temporaryBank && (
        <Modal
          title={t(editing === "profile" ? "editor.editProfile" : "editor.editFact")}
          onClose={() => setEditing(undefined)}
        >
          {editing === "profile" ? (
            <ProfileForm
              profile={extraction.profile}
              bankLocale={extraction.locale}
              onCancel={() => setEditing(undefined)}
              onSave={(profile, locale) => {
                setHasEdits(true);
                setExtraction({ ...extraction, profile, locale });
                setProfileStatus("confirmed");
                setEditing(undefined);
                return [];
              }}
            />
          ) : (
            <FactForm
              bank={temporaryBank}
              kind={editing.kind}
              fact={editing}
              onCancel={() => setEditing(undefined)}
              onSave={(fact) => {
                if (!canConfirm(fact)) {
                  const parent = parentOf(fact);
                  return [
                    t("import.parentFirst", {
                      title: parent ? factTitle(parent) : "contextId" in fact ? fact.contextId : "",
                    }),
                  ];
                }
                setHasEdits(true);
                setExtraction({
                  ...extraction,
                  facts: facts.map((current) => (current.id === fact.id ? fact : current)),
                });
                setStatuses({ ...statuses, [fact.id]: "confirmed" });
                setEditing(undefined);
                return [];
              }}
            />
          )}
        </Modal>
      )}
    </Modal>
  );
}

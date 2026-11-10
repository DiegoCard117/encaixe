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
  type DroppedItem,
  type Extraction,
  type Fact,
  type FactBank,
  type SkillFact,
} from "@encaixe/core";
import { describeParseError, useLlmTask } from "../generation";
import { useI18n } from "../i18n";
import FactForm from "./FactForm";
import ProfileForm from "./ProfileForm";
import { Errors, factTitle, Modal } from "./ui";

type Status = "pending" | "confirmed" | "discarded";
type SavedReview = {
  text: string;
  sourceText: string;
  extraction: Extraction;
  dropped: number;
  droppedItems: DroppedItem[];
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
      // Revisões salvas antes desta versão não têm a lista.
      droppedItems: Array.isArray(value.droppedItems)
        ? value.droppedItems.filter(
            (item: unknown): item is DroppedItem =>
              !!item &&
              typeof item === "object" &&
              ((item as DroppedItem).reason === "invalid" || (item as DroppedItem).reason === "orphan") &&
              ((item as DroppedItem).title === undefined || typeof (item as DroppedItem).title === "string"),
          )
        : [],
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
  const { t, locale } = useI18n();
  const llm = useLlmTask();
  const fileInput = useRef<HTMLInputElement>(null);
  const [restored] = useState(loadReview);
  const [text, setText] = useState(restored?.text ?? "");
  const [sourceText, setSourceText] = useState(restored?.sourceText ?? "");
  const [reading, setReading] = useState(false);
  const [extraction, setExtraction] = useState<Extraction | undefined>(restored?.extraction);
  const [dropped, setDropped] = useState(restored?.dropped ?? 0);
  const [droppedItems, setDroppedItems] = useState<DroppedItem[]>(restored?.droppedItems ?? []);
  const [statuses, setStatuses] = useState<Record<string, Status>>(restored?.statuses ?? {});
  const [profileStatus, setProfileStatus] = useState<Status>(restored?.profileStatus ?? "pending");
  const [hasEdits, setHasEdits] = useState(restored?.hasEdits ?? false);
  const [expandedDecided, setExpandedDecided] = useState<Record<string, boolean>>({});
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
          droppedItems,
          statuses,
          profileStatus,
          hasEdits,
        }),
      );
    } catch {
      /* Review still works without storage. */
    }
  }, [text, sourceText, extraction, dropped, droppedItems, statuses, profileStatus, hasEdits]);
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
      const raw = await callLlm(buildExtractionPrompt({ resumeText: text }));
      const parsed = parseExtraction(raw);
      if (!parsed.ok) {
        const failure = describeParseError(parsed.error, raw, t);
        // O JSON veio, mas sem o essencial: o nome no perfil ou a lista de fatos.
        if (parsed.error === "invalid_schema") llm.setError("import.invalidSchema", failure.detail);
        else llm.setError(failure.key, failure.detail);
        return;
      }
      const merged = mergeExtraction(bank, parsed.extraction);
      setExtraction(merged);
      setSourceText(text);
      setDropped(parsed.dropped);
      setDroppedItems(parsed.droppedItems);
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
  function undo(id: string) {
    const next = { ...statuses, [id]: "pending" as const };
    // A confirmed child must return to pending when its parent is no longer confirmed.
    let changed: boolean;
    do {
      changed = false;
      for (const fact of facts) {
        if (next[fact.id] === "confirmed" && !canConfirm(fact, next)) {
          next[fact.id] = "pending";
          changed = true;
        }
      }
    } while (changed);
    setStatuses(next);
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
  function isDecided(fact: Fact): boolean {
    return (
      (statuses[fact.id] === "confirmed" || statuses[fact.id] === "discarded") &&
      facts.filter((child) => "contextId" in child && child.contextId === fact.id).every(isDecided)
    );
  }
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
    reset: () => void,
    disabled = false,
    hint?: string,
    undoDisabled = false,
  ) {
    return (
      <div className="mt-3">
        <div className={status === "discarded" ? "grid" : "grid grid-cols-3 gap-2"}>
          <button
            type="button"
            className="bank-button min-w-0 px-1 text-center"
            disabled={status === "discarded" ? undoDisabled : status === "pending" && disabled}
            aria-label={t(status === "pending" ? "import.confirmItem" : "import.undoItem", { title: name })}
            onClick={status === "pending" ? confirm : reset}
          >
            {t(status === "pending" ? "import.confirm" : "import.undo")}
          </button>
          {status !== "discarded" && (
            <>
              <button
                type="button"
                className="bank-button min-w-0 px-1 text-center"
                aria-label={t("import.editItem", { title: name })}
                onClick={edit}
              >
                {t("editor.edit")}
              </button>
              <button
                type="button"
                className="bank-button min-w-0 px-1 text-center"
                aria-label={t("import.discardItem", { title: name })}
                onClick={remove}
              >
                {t("import.discard")}
              </button>
            </>
          )}
        </div>
        {hint && <p className="mt-2 break-words text-xs text-muted">{hint}</p>}
      </div>
    );
  }

  function statusBadge(status: Status) {
    return (
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
          status === "confirmed" ? "bg-accent-soft text-accent-ink" : "bg-bg text-muted"
        }`}
      >
        {t(`import.${status}`)}
      </span>
    );
  }

  function formatMonth(value: string) {
    return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${value}-01T00:00:00Z`),
    );
  }

  function factCard(fact: Fact, nested = false) {
    const name = factTitle(fact);
    const status = statuses[fact.id] ?? "pending";
    const warnings = alerts.get(fact.id) ?? [];
    const parent =
      "contextId" in fact
        ? [...(bank?.facts ?? []), ...facts].find((item) => item.id === fact.contextId)
        : undefined;
    const parentDiscarded =
      !!parent && !bank?.facts.some((item) => item.id === parent.id) && statuses[parent.id] === "discarded";
    const hint =
      parentDiscarded && parent
        ? t("import.undoParentFirst", { title: factTitle(parent) })
        : !canConfirm(fact) && parent
          ? t("import.parentFirst", { title: factTitle(parent) })
          : undefined;
    const metadata: string[] = [];
    if ("period" in fact && fact.period) {
      metadata.push(
        `${formatMonth(fact.period.start)} – ${fact.period.end === null ? t("import.current") : formatMonth(fact.period.end)}`,
      );
    }
    if (fact.kind === "education") metadata.push(t(`enum.${fact.type}`), t(`enum.${fact.status}`));
    if (fact.kind === "experience") {
      if (fact.employmentType) metadata.push(t(`enum.${fact.employmentType}`));
      if (fact.workMode) metadata.push(t(`enum.${fact.workMode}`));
      if (fact.location) metadata.push(fact.location);
    }
    if (fact.kind === "skill") {
      metadata.push(t(`enum.${fact.category}`));
      if (fact.level) metadata.push(t(`enum.${fact.level}`));
      metadata.push(...fact.aliases);
    }
    if (fact.kind === "achievement" && fact.date) metadata.push(formatMonth(fact.date));
    if (fact.kind === "project" && fact.role) metadata.push(fact.role);
    if (parent && !nested) metadata.push(factTitle(parent));
    const description =
      fact.kind === "experience" ? fact.summary : fact.kind === "project" ? fact.description : undefined;
    return (
      <div key={fact.id} className="min-w-0">
        <article
          className={`min-w-0 ${nested ? "ml-3 border-l pl-3" : "rounded-xl border p-4"} ${status === "confirmed" ? "border-accent" : "border-line"} ${status === "discarded" ? "opacity-60" : ""}`}
        >
          <div className="flex items-start justify-between gap-2">
            <h4
              className={`min-w-0 break-words font-medium [overflow-wrap:anywhere] ${status === "discarded" ? "line-through" : ""}`}
            >
              {name}
            </h4>
            {statusBadge(status)}
          </div>
          {metadata.length > 0 && (
            <p className="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">
              {metadata.join(" · ")}
            </p>
          )}
          {description && (
            <p className="mt-2 line-clamp-3 break-words whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
              {description}
            </p>
          )}
          {fact.kind === "achievement" && fact.metrics.length > 0 && (
            <p className="mt-2 break-words text-sm [overflow-wrap:anywhere]">
              {fact.metrics
                .map((metric) => `${metric.value}${metric.unit ?? ""} · ${metric.label}`)
                .join(" · ")}
            </p>
          )}
          {"skillIds" in fact && fact.skillIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {fact.skillIds.map((id) => (
                <span
                  key={id}
                  className="max-w-full break-words rounded-full border border-line px-2 py-0.5 text-xs [overflow-wrap:anywhere]"
                >
                  {skills.get(id)?.name ?? id}
                </span>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <p role="alert" className="mt-2 break-words text-xs text-warn-ink [overflow-wrap:anywhere]">
              {t("import.unsupported", {
                values: [...new Set(warnings.map((warning) => warning.value))].join(", "),
              })}
            </p>
          )}
          {actions(
            name,
            status,
            () => setStatuses({ ...statuses, [fact.id]: "confirmed" }),
            () => setEditing(fact),
            () => discard(fact.id),
            () => undo(fact.id),
            !canConfirm(fact),
            hint,
            parentDiscarded,
          )}
        </article>
        <div className="mt-3 space-y-3 empty:hidden">
          {facts
            .filter((child) => child.kind === "achievement" && child.contextId === fact.id)
            .map((child) => factCard(child, true))}
        </div>
      </div>
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
          <div className="flex flex-wrap items-center gap-2">
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
        </div>
      ) : (
        <div className="min-w-0 space-y-5">
          <div>
            <button
              type="button"
              className="min-h-10 text-sm text-muted underline underline-offset-4"
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
            <p role="status" className="text-sm font-medium">
              {t("import.progress", {
                count: confirmed.length + (!bank && profileStatus === "confirmed" ? 1 : 0),
                total: facts.length + (bank ? 0 : 1),
              })}
            </p>
            {llm.modelNotice}
            <p className="mt-1 text-xs text-muted">{t("import.savedReview")}</p>
            <button
              type="button"
              className="min-h-10 text-sm text-muted underline"
              onClick={() => {
                if (!window.confirm(t("import.discardReview"))) return;
                clearReview();
                setExtraction(undefined);
                setText("");
                setSourceText("");
                setStatuses({});
                setProfileStatus("pending");
                setDropped(0);
                setHasEdits(false);
                setExpandedDecided({});
                setEditing(undefined);
                setErrors([]);
                llm.setError(undefined);
              }}
            >
              {t("import.discardSavedReview")}
            </button>
            {dropped > 0 && (
              <div role="status" className="mt-1 text-xs text-warn-ink">
                <p>{t("import.dropped", { count: dropped })}</p>
                {droppedItems.length > 0 && (
                  <ul className="mt-1 list-disc pl-4">
                    {droppedItems.map((item, index) => (
                      <li key={index} className="break-words">
                        {item.title ?? t("import.droppedUntitled")} —{" "}
                        {t(item.reason === "orphan" ? "import.droppedOrphan" : "import.droppedInvalid")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-muted">{t("import.review")}</p>
          </div>
          {!bank && (
            <section
              aria-label={t("editor.profile")}
              className={`min-w-0 rounded-xl border p-4 ${profileStatus === "confirmed" ? "border-accent" : "border-line"} ${profileStatus === "discarded" ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3
                  className={`min-w-0 break-words font-medium [overflow-wrap:anywhere] ${profileStatus === "discarded" ? "line-through" : ""}`}
                >
                  {extraction.profile.fullName}
                </h3>
                {statusBadge(profileStatus)}
              </div>
              <p className="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">
                {[
                  extraction.profile.headline,
                  extraction.profile.email,
                  extraction.profile.phone,
                  extraction.profile.location,
                  ...extraction.profile.links.map((link) => `${link.label} · ${link.url}`),
                  t(`enum.${extraction.locale}`),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {actions(
                extraction.profile.fullName,
                profileStatus,
                () => setProfileStatus("confirmed"),
                () => setEditing("profile"),
                () => setProfileStatus("discarded"),
                () => setProfileStatus("pending"),
              )}
            </section>
          )}
          {(["experience", "project", "education", "skill", "achievement"] as const).map((kind) => {
            const items = facts.filter(
              (fact) =>
                fact.kind === kind &&
                (fact.kind !== "achievement" || !facts.some((parent) => parent.id === fact.contextId)),
            );
            const collapsible = kind === "experience" || kind === "project" || kind === "education";
            const decided = collapsible ? items.filter(isDecided) : [];
            const visible = collapsible ? items.filter((fact) => !isDecided(fact)) : items;
            const unsupportedSkills =
              kind === "skill" ? items.filter((fact) => alerts.get(fact.id)?.length).map(factTitle) : [];
            return (
              items.length > 0 && (
                <section key={kind} className="min-w-0 space-y-3">
                  <h3 className="font-display text-lg">
                    {t(`editor.${kind}`)} · {items.length}
                  </h3>
                  {kind === "skill" ? (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {items.map((fact) => {
                          const selected = statuses[fact.id] === "confirmed";
                          return (
                            <button
                              key={fact.id}
                              type="button"
                              className={`min-h-10 max-w-full break-words rounded-full border px-3 text-sm [overflow-wrap:anywhere] ${alerts.get(fact.id)?.length ? "border-warn-line" : "border-line"} ${selected ? "bg-accent-soft text-accent-ink" : ""}`}
                              aria-pressed={selected}
                              onClick={() =>
                                selected
                                  ? undo(fact.id)
                                  : setStatuses({ ...statuses, [fact.id]: "confirmed" })
                              }
                            >
                              {selected && <span aria-hidden="true">✓ </span>}
                              {factTitle(fact)}
                            </button>
                          );
                        })}
                      </div>
                      {unsupportedSkills.length > 0 && (
                        <p className="break-words text-xs text-warn-ink [overflow-wrap:anywhere]">
                          {t("import.unsupported", { values: unsupportedSkills.join(", ") })}
                        </p>
                      )}
                    </>
                  ) : (
                    visible.map((fact) => factCard(fact))
                  )}
                  {decided.length > 0 && (
                    <div>
                      <button
                        type="button"
                        className="min-h-10 text-sm text-muted"
                        aria-expanded={!!expandedDecided[kind]}
                        onClick={() =>
                          setExpandedDecided((current) => ({ ...current, [kind]: !current[kind] }))
                        }
                      >
                        {t("import.decidedCount", { count: decided.length })}
                      </button>
                      {expandedDecided[kind] && (
                        <div className="mt-3 space-y-3">{decided.map((fact) => factCard(fact))}</div>
                      )}
                    </div>
                  )}
                </section>
              )
            );
          })}
          <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:-mx-7 sm:px-7">
            <p className="text-xs text-muted">{t("import.pendingHelp")}</p>
            {!bank && profileStatus !== "confirmed" && (
              <p className="mt-1 text-xs text-muted">{t("import.confirmProfile")}</p>
            )}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" className="bank-button min-w-0 text-center" onClick={confirmAll}>
                {t("import.confirmAll")}
              </button>
              <button
                type="button"
                className="bank-button min-w-0 bg-accent-soft text-center text-accent-ink"
                disabled={(!bank && profileStatus !== "confirmed") || (!!bank && !confirmed.length)}
                onClick={save}
              >
                {t("import.add", { count: confirmed.length })}
              </button>
            </div>
          </div>
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

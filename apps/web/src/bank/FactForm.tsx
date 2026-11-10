import { useState } from "react";
import { useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ExperienceFactSchema,
  ProjectFactSchema,
  AchievementFactSchema,
  EducationFactSchema,
  SkillFactSchema,
  FactSchema,
  createFactId,
  type Fact,
  type FactInput,
  type FactKind,
  type FactBank,
} from "@encaixe/core";
import { useI18n, type TranslationKey } from "../i18n";
import { Errors, factTitle } from "./ui";
import { describePath } from "../paths";

const schemas = {
  experience: ExperienceFactSchema,
  project: ProjectFactSchema,
  achievement: AchievementFactSchema,
  education: EducationFactSchema,
  skill: SkillFactSchema,
};
const fields = {
  experience: ["company", "role", "location", "summary"],
  project: ["name", "description", "role", "url", "repositoryUrl"],
  achievement: ["text", "date"],
  education: ["institution", "title", "credentialUrl"],
  skill: ["name"],
} as const;
const enums = {
  employmentType: ["employee", "contractor", "internship", "freelance", "volunteer", "other"],
  workMode: ["onsite", "hybrid", "remote"],
  category: [
    "programming_language",
    "framework",
    "library",
    "database",
    "tool",
    "platform",
    "practice",
    "soft_skill",
    "spoken_language",
  ],
  level: ["basic", "intermediate", "advanced", "expert"],
  type: [
    "high_school",
    "technical",
    "technologist",
    "bachelor",
    "postgraduate",
    "master",
    "doctorate",
    "course",
    "bootcamp",
    "certification",
  ],
  status: ["completed", "in_progress", "incomplete"],
} as const;
const enumFields = {
  experience: ["employmentType", "workMode"],
  project: [],
  achievement: [],
  education: ["type", "status"],
  skill: ["category", "level"],
} as const;
const csv = (value: unknown) =>
  Array.isArray(value)
    ? value
    : String(value)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

export default function FactForm({
  bank,
  kind,
  fact,
  contextId,
  onSave,
  onCancel,
}: {
  bank: FactBank;
  kind: FactKind;
  fact?: Fact;
  contextId?: string;
  onSave: (fact: Fact) => string[];
  onCancel: () => void;
}) {
  const { t, tIssue } = useI18n();
  const [errors, setErrors] = useState<string[]>([]);
  const [initial] = useState<FactInput>(
    () =>
      fact ??
      ({
        id: createFactId(kind),
        kind,
        tags: [],
        archived: false,
        ...(kind !== "skill" ? { skillIds: [] } : { aliases: [], category: "tool", name: "" }),
        ...(kind === "experience" ? { company: "", role: "", period: { start: "", end: null } } : {}),
        ...(kind === "project" ? { name: "", description: "" } : {}),
        ...(kind === "education" ? { institution: "", title: "", type: "course", status: "completed" } : {}),
        ...(kind === "achievement" ? { contextId, text: "", metrics: [] } : {}),
      } as FactInput),
  );
  const initialPeriod = "period" in initial ? initial.period : undefined;
  const [period, setPeriod] = useState(!!initialPeriod || kind === "experience");
  const [current, setCurrent] = useState(initialPeriod?.end == null);
  const { register, control, handleSubmit, setValue } = useForm<FactInput, unknown, Fact>({
    // Each instance uses its own kind's core schema; the shared form accepts the union.
    resolver: zodResolver(schemas[kind] as unknown as typeof FactSchema),
    defaultValues: initial,
  });
  const metrics = useFieldArray({ control, name: "metrics" });
  const field = (name: string) => name as FieldPath<FactInput>;
  const label = (name: string) => t(`field.${name}` as TranslationKey);
  return (
    <form
      className="bank-form"
      noValidate
      onSubmit={handleSubmit(
        (value) => setErrors(onSave(value)),
        (invalid) => {
          const collect = (value: unknown, path: (string | number)[]): string[] => {
            if (!value || typeof value !== "object") return [];
            if ("message" in value && typeof value.message === "string")
              return [`${describePath(path, t)}: ${tIssue({ message: value.message })}`];
            return Object.entries(value)
              .filter(([key]) => key !== "ref")
              .flatMap(([key, child]) => collect(child, [...path, /^\d+$/.test(key) ? Number(key) : key]));
          };
          setErrors(collect(invalid, []));
        },
      )}
    >
      {fields[kind].map((name) => (
        <label key={name}>
          {label(name)}
          {["description", "summary", "text"].includes(name) ? (
            <textarea
              rows={4}
              {...register(field(name), {
                setValueAs: (v: string) => (name === "summary" && !v.trim() ? undefined : v),
              })}
            />
          ) : (
            <input
              type={name === "date" ? "month" : name.toLowerCase().includes("url") ? "url" : "text"}
              {...register(field(name), {
                setValueAs: (v: string) =>
                  ["date", "location", "url", "repositoryUrl", "credentialUrl"].includes(name) ||
                  (name === "role" && kind === "project")
                    ? v.trim() || undefined
                    : v,
              })}
            />
          )}
        </label>
      ))}
      {enumFields[kind].map((name) => (
        <label key={name}>
          {label(name)}
          <select {...register(field(name), { setValueAs: (v: string) => v || undefined })}>
            <option value="">{t("editor.optional")}</option>
            {enums[name].map((value) => (
              <option value={value} key={value}>
                {t(`enum.${value}`)}
              </option>
            ))}
          </select>
        </label>
      ))}
      {kind === "project" && (
        <label>
          {t("field.contextId")}
          <select {...register("contextId", { setValueAs: (v: string) => v || undefined })}>
            <option value="">{t("editor.optional")}</option>
            {bank.facts
              .filter((f) => f.kind === "experience" || f.kind === "education")
              .map((f) => (
                <option value={f.id} key={f.id}>
                  {f.id} · {f.kind === "experience" ? f.company : f.kind === "education" ? f.title : ""}
                </option>
              ))}
          </select>
        </label>
      )}
      {kind === "achievement" && (
        <p className="break-all text-sm">
          {t("field.contextId")}:{" "}
          <span>
            {(() => {
              const id = "contextId" in initial ? initial.contextId : contextId;
              const parent = bank.facts.find((fact) => fact.id === id);
              return parent ? factTitle(parent) : id;
            })()}
          </span>
        </p>
      )}
      {(["experience", "project", "education"] as FactKind[]).includes(kind) && (
        <fieldset>
          <legend className="font-display">{t("editor.period")}</legend>
          {kind !== "experience" && (
            <label className="bank-check">
              <input
                type="checkbox"
                checked={period}
                onChange={(e) => {
                  setPeriod(e.target.checked);
                  setValue("period", e.target.checked ? { start: "", end: null } : undefined);
                  setCurrent(true);
                }}
              />
              {t("editor.period")}
            </label>
          )}
          {period && (
            <>
              <label>
                {t("field.start")}
                <input type="month" {...register("period.start")} />
              </label>
              <label className="bank-check">
                <input
                  type="checkbox"
                  checked={current}
                  onChange={(e) => {
                    setCurrent(e.target.checked);
                    setValue("period.end", e.target.checked ? null : "");
                  }}
                />
                {t("editor.current")}
              </label>
              {!current && (
                <label>
                  {t("field.end")}
                  <input type="month" {...register("period.end")} />
                </label>
              )}
            </>
          )}
        </fieldset>
      )}
      {kind !== "skill" && (
        <fieldset>
          <legend className="font-display">{t("field.skillIds")}</legend>
          {bank.facts
            .filter((f) => f.kind === "skill")
            .map((skill) => (
              <label className="bank-check" key={skill.id}>
                <input type="checkbox" value={skill.id} {...register("skillIds")} />
                {skill.kind === "skill" && skill.name}
              </label>
            ))}
        </fieldset>
      )}
      {kind === "achievement" && (
        <fieldset>
          <legend className="font-display">{t("editor.metrics")}</legend>
          {metrics.fields.map((metric, i) => (
            <div key={metric.id} className="bank-card space-y-3">
              <label>
                {t("field.value")}
                <input
                  type="number"
                  step="any"
                  {...register(`metrics.${i}.value`, { valueAsNumber: true })}
                />
              </label>
              <label>
                {t("field.unit")}
                <input
                  {...register(`metrics.${i}.unit`, { setValueAs: (v: string) => v.trim() || undefined })}
                />
              </label>
              <label>
                {t("field.label")}
                <input {...register(`metrics.${i}.label`)} />
              </label>
              <button className="bank-button" type="button" onClick={() => metrics.remove(i)}>
                {t("editor.remove")}
              </button>
            </div>
          ))}
          <button
            className="bank-button"
            type="button"
            disabled={metrics.fields.length >= 10}
            onClick={() => metrics.append({ value: 0, label: "", unit: "" })}
          >
            {t("editor.addMetric")}
          </button>
        </fieldset>
      )}
      {kind === "skill" && (
        <label>
          {t("field.aliases")}
          <input {...register("aliases", { setValueAs: csv })} />
          <small className="text-muted">{t("editor.commas")}</small>
        </label>
      )}
      <label>
        {t("field.tags")}
        <input {...register("tags", { setValueAs: csv })} />
        <small className="text-muted">{t("editor.commas")}</small>
      </label>
      <Errors errors={errors} />
      <div className="flex flex-wrap gap-2">
        <button className="bank-button bg-accent-soft text-accent-ink" type="submit">
          {t("editor.save")}
        </button>
        <button className="bank-button" type="button" onClick={onCancel}>
          {t("editor.cancel")}
        </button>
      </div>
    </form>
  );
}

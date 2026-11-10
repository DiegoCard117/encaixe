import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ProfileSchema, type Profile, type ProfileInput } from "@encaixe/core";
import { useI18n } from "../i18n";
import { Errors } from "./ui";

export default function ProfileForm({
  profile,
  bankLocale,
  onSave,
  onCancel,
}: {
  profile?: Profile;
  bankLocale: "pt-BR" | "en";
  onSave: (profile: Profile, locale: "pt-BR" | "en") => string[];
  onCancel: () => void;
}) {
  const { t, tIssue } = useI18n();
  const [errors, setErrors] = useState<string[]>([]);
  const [locale, setLocale] = useState(bankLocale);
  const { register, control, handleSubmit } = useForm<ProfileInput, unknown, Profile>({
    resolver: zodResolver(ProfileSchema),
    defaultValues: profile ?? { fullName: "", links: [] },
  });
  const links = useFieldArray({ control, name: "links" });
  return (
    <form
      noValidate
      className="bank-form"
      onSubmit={handleSubmit(
        (value) => setErrors(onSave(value, locale)),
        (invalid) => {
          const collect = (value: unknown, path: string): string[] => {
            if (!value || typeof value !== "object") return [];
            if ("message" in value && typeof value.message === "string")
              return [`${path}: ${tIssue({ message: value.message })}`];
            return Object.entries(value)
              .filter(([key]) => key !== "ref")
              .flatMap(([key, child]) => collect(child, path ? `${path}.${key}` : key));
          };
          setErrors(collect(invalid, ""));
        },
      )}
    >
      {(["fullName", "headline", "email", "phone", "location"] as const).map((name) => (
        <label key={name}>
          {t(`field.${name}`)}
          <input
            type={name === "email" ? "email" : name === "phone" ? "tel" : "text"}
            {...register(name, {
              setValueAs: (v: string) => (name !== "fullName" && !v.trim() ? undefined : v),
            })}
          />
        </label>
      ))}
      <label>
        {t("field.locale")}
        <select value={locale} onChange={(e) => setLocale(e.target.value === "en" ? "en" : "pt-BR")}>
          <option value="pt-BR">{t("enum.pt-BR")}</option>
          <option value="en">{t("enum.en")}</option>
        </select>
      </label>
      <fieldset>
        <legend className="font-display">{t("editor.links")}</legend>
        {links.fields.map((link, i) => (
          <div key={link.id} className="bank-card space-y-3">
            <label>
              {t("field.label")}
              <input {...register(`links.${i}.label`)} />
            </label>
            <label>
              {t("field.url")}
              <input type="url" {...register(`links.${i}.url`)} />
            </label>
            <button type="button" className="bank-button" onClick={() => links.remove(i)}>
              {t("editor.remove")}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="bank-button"
          disabled={links.fields.length >= 10}
          onClick={() => links.append({ label: "", url: "" })}
        >
          {t("editor.addLink")}
        </button>
      </fieldset>
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

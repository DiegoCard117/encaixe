import { useMemo, useState } from "react";
import { analyzeFit, type FactBank } from "@encaixe/core";
import { useI18n, type Locale } from "../i18n";
import { useGeneration } from "../generation";

export default function JobStep({ bank }: { bank: FactBank }) {
  const { t, locale: uiLocale } = useI18n();
  const [jobText, setJobText] = useState(() => {
    try {
      return localStorage.getItem("encaixe.job") ?? "";
    } catch {
      return "";
    }
  });
  const [storageError, setStorageError] = useState(false);
  const [locale, setLocale] = useState<Locale>(bank.locale);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const fit = useMemo(() => analyzeFit(bank, jobText), [bank, jobText]);
  const generation = useGeneration(bank, jobText, locale, () => {
    location.hash = "#/revisao";
  });
  const number = (n: number) => new Intl.NumberFormat(uiLocale).format(n);
  return (
    <section aria-busy={generation.busy} className="space-y-6">
      <h2 className="font-display text-2xl font-semibold">{t("editor.step2")}</h2>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="bank-card space-y-4">
          <label className="block font-medium" htmlFor="job-text">
            {t("job.text")}
          </label>
          <textarea
            id="job-text"
            // Cresce com o texto colado (field-sizing) entre 60% e 80% da tela; acima disso rola por dentro.
            className="max-h-[80dvh] min-h-[60dvh] w-full resize-y rounded-lg border border-line bg-bg p-3 text-ink [field-sizing:content]"
            rows={16}
            value={jobText}
            disabled={generation.busy}
            onChange={(e) => {
              setJobText(e.target.value);
              try {
                localStorage.setItem("encaixe.job", e.target.value);
                setStorageError(false);
              } catch {
                setStorageError(true);
              }
            }}
          />
          {storageError && (
            <p role="alert" className="text-warn-ink">
              {t("generation.storage")}
            </p>
          )}
          <label className="block" htmlFor="resume-locale">
            {t("field.locale")}
          </label>
          <select
            id="resume-locale"
            className="rounded-lg border border-line bg-bg p-3 text-ink min-h-10 w-full"
            value={locale}
            disabled={generation.busy}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            <option value="pt-BR">{t("enum.pt-BR")}</option>
            <option value="en">{t("enum.en")}</option>
          </select>
          <button
            type="button"
            className="bank-button min-h-10 bg-accent-soft text-accent-ink"
            disabled={generation.busy || !jobText.trim()}
            onClick={generation.generate}
          >
            {t(generation.busy ? "generation.busy" : "job.generate")}
          </button>
          {generation.controls}
        </div>
        <div className="space-y-5">
          <section className="bank-card space-y-4" aria-labelledby="fit-title">
            <h3 id="fit-title" className="font-display text-xl">
              {t("job.fit")}
            </h3>
            <p aria-live="polite">
              {t("job.count", {
                count: number(fit.matchedSkills.length),
                total: number(fit.matchedSkills.length + fit.gaps.length),
              })}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {fit.matchedSkills.map((skill) => (
                <li key={skill.skillId} className="rounded-lg bg-accent-soft p-3 text-accent-ink">
                  <p className="font-medium">{skill.term}</p>
                  <p className="text-sm">{t("job.factsCount", { count: number(skill.factIds.length) })}</p>
                </li>
              ))}
            </ul>
            <h4 className="font-semibold">{t("job.gaps")}</h4>
            <ul className="space-y-3">
              {fit.gaps
                .filter((gap) => !dismissed.includes(gap))
                .map((gap) => (
                  <li key={gap} className="rounded-lg border border-warn-line bg-warn-soft p-3 text-warn-ink">
                    <p>{gap}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a className="bank-button min-h-10" href="#/">
                        {t("job.addFact")}
                      </a>
                      <button
                        type="button"
                        className="bank-button min-h-10"
                        onClick={() => setDismissed([...dismissed, gap])}
                      >
                        {t("job.dismiss")}
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          </section>
          <section className="bank-card space-y-3">
            <h3 className="font-display text-xl">{t("job.relevant")}</h3>
            <ol className="space-y-3">
              {fit.rankedFacts.slice(0, 10).map(({ factId }) => {
                const fact = bank.facts.find((item) => item.id === factId);
                if (!fact) return null;
                const title =
                  fact.kind === "experience"
                    ? `${fact.role} · ${fact.company}`
                    : fact.kind === "achievement"
                      ? fact.text
                      : fact.kind === "education"
                        ? fact.title
                        : fact.name;
                return (
                  <li key={factId}>
                    <p>{title}</p>
                    <p className="break-all font-mono text-xs text-muted">{factId}</p>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </section>
  );
}

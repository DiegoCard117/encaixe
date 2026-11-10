import { useEffect, useState } from "react";
import { useI18n } from "./i18n";
import { applyTheme, readTheme, setTheme, type ThemePref } from "./theme";
import Playground from "./Playground";
import BankEditor from "./bank/BankEditor";
import { loadBank } from "./bank/storage";
import JobStep from "./job/JobStep";
import ReviewStep from "./review/ReviewStep";

export default function App() {
  const { locale, setLocale, t } = useI18n();
  const [theme, setThemePref] = useState<ThemePref>(readTheme);
  const [hash, setHash] = useState(() => location.hash);
  const [saved, setSaved] = useState(() => loadBank().status === "ok");
  const stored = loadBank();
  const bank = stored.status === "ok" ? stored.bank : undefined;
  const stepRoute = hash === "#/vaga" || hash === "#/revisao";
  useEffect(() => applyTheme(theme), [theme]);
  useEffect(() => {
    const update = () => setHash(location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  function cycleTheme() {
    const next: ThemePref = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    setThemePref(next);
  }
  return (
    <main className="app-shell mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12 [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-offset-2 [&_:focus-visible]:outline-accent">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6 print:hidden">
        <div>
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 28 28" className="size-10" aria-hidden="true">
              <path d="M3 5H13V11H9V17H13V23H3Z" fill="var(--accent)" />
              <path d="M15 5H25V23H15V16H10V12H15Z" fill="var(--ink)" />
            </svg>
            <h1 className="font-display text-3xl font-semibold tracking-tight">{t("app.name")}</h1>
          </div>
          <p className="mt-2 text-muted">{t("editor.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cycleTheme}
            aria-label={t("header.theme", { theme: t(`theme.${theme}`) })}
            className="min-h-10 rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-accent-soft"
          >
            {t(`theme.${theme}`)}
          </button>
          <button
            type="button"
            onClick={() => setLocale(locale === "pt-BR" ? "en" : "pt-BR")}
            aria-label={t("header.locale")}
            className="min-h-10 rounded-lg border border-line bg-surface px-3 py-2 text-sm hover:bg-accent-soft"
          >
            {t("header.localeShort")}
          </button>
        </div>
      </header>
      <nav className="mb-8 flex flex-wrap items-center gap-3 print:hidden" aria-label={t("editor.steps")}>
        <a
          className="bank-button bg-accent-soft text-accent-ink"
          href="#/"
          aria-current={!stepRoute && hash !== "#/playground" ? "step" : undefined}
        >
          {t("editor.step1")}
        </a>
        {(["#/vaga", "#/revisao"] as const).map((route, index) =>
          bank ? (
            <a
              key={route}
              className={`bank-button min-h-10 ${hash === route ? "bg-accent-soft text-accent-ink" : "text-muted"}`}
              href={route}
              aria-current={hash === route ? "step" : undefined}
            >
              {t(index === 0 ? "editor.step2" : "editor.step3")}
            </a>
          ) : (
            <span key={route} className="bank-button min-h-10 text-muted" aria-disabled="true">
              {t(index === 0 ? "editor.step2" : "editor.step3")}
            </span>
          ),
        )}
        <span role="status" className="text-sm text-muted sm:ml-auto">
          {t(saved ? "editor.saved" : "editor.notSaved")}
        </span>
      </nav>
      <div hidden={hash === "#/playground" || (stepRoute && !!bank)}>
        <BankEditor onSaved={setSaved} />
      </div>
      {hash === "#/playground" && <Playground />}
      {hash === "#/vaga" && bank && <JobStep bank={bank} />}
      {hash === "#/revisao" && bank && <ReviewStep bank={bank} />}
    </main>
  );
}

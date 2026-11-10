import type { Fact } from "@encaixe/core";
import { isTranslationKey, type useI18n } from "./i18n";
import { factTitle } from "./bank/ui";

export function describePath(
  path: readonly PropertyKey[],
  t: ReturnType<typeof useI18n>["t"],
  bank?: unknown,
): string {
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const segment = path[i];
    const next = path[i + 1];
    if (segment === "period" && (next === "start" || next === "end")) continue;
    if (
      segment === "text" &&
      i === path.length - 1 &&
      (path.includes("bullets") || path[0] === "headline" || path[0] === "summary")
    )
      continue;
    if (
      segment === "facts" &&
      typeof next === "number" &&
      bank &&
      typeof bank === "object" &&
      "facts" in bank &&
      Array.isArray(bank.facts)
    ) {
      const fact: unknown = bank.facts[next];
      if (fact && typeof fact === "object" && "kind" in fact) {
        const titleFields =
          fact.kind === "experience"
            ? ["role", "company"]
            : fact.kind === "education"
              ? ["title", "institution"]
              : fact.kind === "achievement"
                ? ["text"]
                : fact.kind === "skill" || fact.kind === "project"
                  ? ["name"]
                  : [];
        if (
          titleFields.length &&
          titleFields.every(
            (key) => key in fact && typeof (fact as Record<string, unknown>)[key] === "string",
          )
        ) {
          const title = factTitle(fact as Fact);
          if (title.trim()) {
            parts.push(title);
            i++;
            continue;
          }
        }
      }
    }
    if (typeof segment === "number") {
      parts.push(String(segment + 1));
      continue;
    }
    const sectionKey = `path.${String(segment)}`;
    const fieldKey = `field.${String(segment)}`;
    const label = isTranslationKey(sectionKey)
      ? t(sectionKey)
      : isTranslationKey(fieldKey)
        ? t(fieldKey)
        : String(segment);
    if (typeof next === "number") {
      parts.push(`${label} ${next + 1}`);
      i++;
    } else {
      parts.push(label);
    }
  }
  return parts.join(" · ") || t("draft.root");
}

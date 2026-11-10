import type { Violation } from "@encaixe/core";

export function highlight(text: string, violations: Violation[]) {
  const values = [
    ...new Set(
      violations
        .filter(({ code }) => code === "unsupported_skill" || code === "unsupported_number")
        .map(({ value }) => value),
    ),
  ].filter(Boolean);
  if (!values.length) return text;
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])(${values
      .sort((a, b) => b.length - a.length)
      .map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})(?![\\p{L}\\p{N}])`,
    "giu",
  );
  return text.split(pattern).map((part, index) => (index % 2 ? <mark key={index}>{part}</mark> : part));
}

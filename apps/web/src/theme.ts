export type ThemePref = "system" | "light" | "dark";

export function readTheme(): ThemePref {
  try {
    const saved = localStorage.getItem("encaixe.theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage can be unavailable; follow the system in that case.
  }
  return "system";
}

export function applyTheme(theme: ThemePref): void {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: ThemePref): void {
  try {
    localStorage.setItem("encaixe.theme", theme);
  } catch {
    // The theme still works for this session without storage.
  }
  applyTheme(theme);
}

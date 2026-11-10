import { afterEach, expect, it, vi } from "vitest";
import { FactBankSchema } from "@encaixe/core";
import { sampleBank } from "@encaixe/core/fixtures";
import { loadBankSavedAt, saveBank } from "./storage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("persists the local save date for later sessions", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-10T12:00:00Z"));
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  expect(loadBankSavedAt()).toBeUndefined();
  expect(saveBank(FactBankSchema.parse(sampleBank))).toBe(true);
  expect(values.get("encaixe.bankSavedAt")).toBe("2026-11-10T12:00:00.000Z");
  vi.setSystemTime(new Date("2026-11-11T12:00:00Z"));
  expect(loadBankSavedAt()).toBe("2026-11-10T12:00:00.000Z");
  values.set("encaixe.bankSavedAt", "invalid");
  expect(loadBankSavedAt()).toBeUndefined();
});

it("does not record a date when saving the bank fails", () => {
  const setItem = vi.fn(() => {
    throw new Error("storage");
  });
  vi.stubGlobal("localStorage", { setItem });
  expect(saveBank(FactBankSchema.parse(sampleBank))).toBe(false);
  expect(setItem).toHaveBeenCalledTimes(1);
  expect(loadBankSavedAt()).toBeUndefined();
});

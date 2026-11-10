import { FactBankSchema, type FactBank } from "@encaixe/core";

export type StoredBank =
  { status: "empty" } | { status: "ok"; bank: FactBank } | { status: "invalid"; raw: string };

export function loadBank(): StoredBank {
  let raw: string | null;
  try {
    raw = localStorage.getItem("encaixe.bank");
  } catch {
    // Do not allow an unreadable existing bank to be overwritten.
    return { status: "invalid", raw: "" };
  }
  if (raw === null) return { status: "empty" };
  try {
    const result = FactBankSchema.safeParse(JSON.parse(raw));
    if (result.success) return { status: "ok", bank: result.data };
  } catch {
    // Preserve the exact original content, including malformed JSON.
  }
  return { status: "invalid", raw };
}

export function saveBank(bank: FactBank): boolean {
  try {
    localStorage.setItem("encaixe.bank", JSON.stringify(bank));
    return true;
  } catch {
    return false;
  }
}

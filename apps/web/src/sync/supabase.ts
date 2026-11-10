import { FactBankSchema, type FactBank } from "@encaixe/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LastSync, Remote } from "./decide";

export type SyncConfig = { url: string; key: string };
export type ConfigError = "invalid_url" | "missing_key" | "secret_key";
export type SyncErrorCode =
  | ConfigError
  | "network"
  | "auth"
  | "not_configured"
  | "table_missing"
  | "invalid_remote"
  | "api"
  | "storage"
  | "invalid_local";
export class SyncError extends Error {
  constructor(
    public code: SyncErrorCode,
    /** Mensagem original do Supabase, para a pessoa (e o suporte) saberem a causa. */
    public detail?: string,
  ) {
    super(code);
  }
}

export function validateConfig(url: string, key: string): ConfigError | undefined {
  key = key.trim();
  if (key.startsWith("sb_secret_")) return "secret_key";
  try {
    const payload = key.split(".")[1];
    if (payload) {
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      if (JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))).role === "service_role")
        return "secret_key";
    }
  } catch {
    /* Publishable keys are not JWTs. */
  }
  try {
    const parsed = new URL(url);
    if (
      parsed.username ||
      parsed.password ||
      !(
        parsed.protocol === "https:" ||
        (parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))
      )
    )
      return "invalid_url";
  } catch {
    return "invalid_url";
  }
  if (!key) return "missing_key";
}

export function loadSyncConfig(): SyncConfig | undefined {
  try {
    const value = JSON.parse(localStorage.getItem("encaixe.supabase") ?? "null");
    if (
      typeof value?.url === "string" &&
      typeof value?.key === "string" &&
      !validateConfig(value.url, value.key)
    )
      return { url: value.url.trim(), key: value.key.trim() };
  } catch {
    /* Storage may be unavailable. */
  }
}
export function saveSyncConfig(config: SyncConfig): boolean {
  if (validateConfig(config.url, config.key)) return false;
  try {
    localStorage.setItem(
      "encaixe.supabase",
      JSON.stringify({ url: config.url.trim(), key: config.key.trim() }),
    );
    return true;
  } catch {
    return false;
  }
}
export function clearSyncConfig(): boolean {
  try {
    localStorage.removeItem("encaixe.supabase");
    return true;
  } catch {
    return false;
  }
}
export function loadLastSync(owner?: string): LastSync | undefined {
  try {
    const value = JSON.parse(localStorage.getItem("encaixe.sync") ?? "null");
    if (
      value?.owner === owner &&
      typeof value?.bankJson === "string" &&
      typeof value?.remoteUpdatedAt === "string"
    )
      return value;
  } catch {
    /* A missing baseline requires conflict confirmation. */
  }
}
export function saveLastSync(last: LastSync, owner?: string): void {
  try {
    localStorage.setItem("encaixe.sync", JSON.stringify({ ...last, owner }));
  } catch {
    throw new SyncError("storage");
  }
}
export function clearLastSync(): void {
  try {
    localStorage.removeItem("encaixe.sync");
  } catch {
    throw new SyncError("storage");
  }
}

export function syncError(error: unknown): SyncError {
  if (error instanceof SyncError) return error;
  const value = error as { code?: string; status?: number; message?: string; name?: string } | null;
  const message = value?.message ?? "";
  const detail =
    [value?.code, value?.status, message]
      .filter((part) => part !== undefined && part !== "")
      .join(" · ")
      .slice(0, 300) || undefined;
  if (
    ["42P01", "PGRST205"].includes(value?.code ?? "") ||
    /relation .* does not exist|could not find .*fact_banks/i.test(message)
  )
    return new SyncError("table_missing", detail);
  if (
    error instanceof TypeError ||
    /fetch|network|failed to load/i.test(message) ||
    value?.name === "AuthRetryableFetchError"
  )
    return new SyncError("network", detail);
  if (
    value?.status === 401 ||
    value?.status === 403 ||
    value?.code === "42501" ||
    /Auth.*Error/.test(value?.name ?? "")
  )
    return new SyncError("auth", detail);
  return new SyncError("api", detail);
}

let cached: { id: string; client: Promise<SupabaseClient> } | undefined;
export async function getClient(config: SyncConfig): Promise<SupabaseClient> {
  const invalid = validateConfig(config.url, config.key);
  if (invalid) throw new SyncError(invalid);
  const id = JSON.stringify([config.url, config.key]);
  if (!cached || cached.id !== id) {
    const client = import("@supabase/supabase-js")
      .then(({ createClient }) =>
        createClient(config.url, config.key, {
          auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true },
        }),
      )
      .catch(() => {
        if (cached?.id === id) cached = undefined;
        throw new SyncError("network");
      });
    cached = { id, client };
  }
  return cached.client;
}
async function configuredClient() {
  const config = loadSyncConfig();
  if (!config) throw new SyncError("not_configured");
  return getClient(config);
}
async function userClient() {
  const client = await configuredClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw syncError(error);
  if (!data.user) throw new SyncError("auth");
  return { client, user: data.user };
}
export async function sendMagicLink(email: string): Promise<void> {
  try {
    const client = await configuredClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname },
    });
    if (error) throw error;
  } catch (error) {
    throw syncError(error);
  }
}
export async function currentEmail(): Promise<string | undefined> {
  try {
    const client = await configuredClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session?.user.email;
  } catch (error) {
    throw syncError(error);
  }
}
export async function verifyCode(email: string, token: string): Promise<void> {
  try {
    const client = await configuredClient();
    const { error } = await client.auth.verifyOtp({ email, token, type: "email" });
    if (error) throw error;
  } catch (error) {
    throw syncError(error);
  }
}
export async function signOut(): Promise<void> {
  try {
    const client = await configuredClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
  } catch (error) {
    throw syncError(error);
  }
}
export async function fetchRemote(): Promise<Remote> {
  try {
    const { client, user } = await userClient();
    const { data, error } = await client
      .from("fact_banks")
      .select("bank, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return;
    const bank = FactBankSchema.safeParse(data.bank);
    if (!bank.success || typeof data.updated_at !== "string" || !Number.isFinite(Date.parse(data.updated_at)))
      throw new SyncError("invalid_remote");
    return { bankJson: JSON.stringify(bank.data), updatedAt: data.updated_at };
  } catch (error) {
    throw syncError(error);
  }
}
/** Apaga o banco deste login no Supabase (a política RLS só deixa apagar o próprio). */
export async function deleteRemote(): Promise<void> {
  try {
    const { client, user } = await userClient();
    const { error } = await client.from("fact_banks").delete().eq("user_id", user.id);
    if (error) throw error;
  } catch (error) {
    throw syncError(error);
  }
}

export async function pushRemote(bank: FactBank): Promise<string> {
  try {
    const { client, user } = await userClient();
    const { data, error } = await client
      .from("fact_banks")
      .upsert({ user_id: user.id, bank: FactBankSchema.parse(bank), updated_at: new Date().toISOString() })
      .select("updated_at")
      .single();
    if (error) throw error;
    if (typeof data?.updated_at !== "string" || !Number.isFinite(Date.parse(data.updated_at)))
      throw new SyncError("api");
    return data.updated_at;
  } catch (error) {
    throw syncError(error);
  }
}

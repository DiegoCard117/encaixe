import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sampleBank } from "@encaixe/core/fixtures";
import { FactBankSchema } from "@encaixe/core";
import {
  clearLastSync,
  clearSyncConfig,
  connectionLink,
  fetchRemote,
  getClient,
  loadLastSync,
  loadSyncConfig,
  pushRemote,
  readConnectionLink,
  saveLastSync,
  saveSyncConfig,
  setPassword,
  signInWithPassword,
  syncError,
  validateConfig,
  verifyCode,
} from "./supabase";

const mock = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  verifyOtp: vi.fn(),
  updateUser: vi.fn(),
  signInWithPassword: vi.fn(),
  maybeSingle: vi.fn(),
  single: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.createClient }));
const config = { url: "https://example.supabase.co", key: "sb_publishable_public" };
const bank = FactBankSchema.parse(sampleBank);

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  });
  mock.getUser.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
  mock.from.mockReturnValue({ select: mock.select, upsert: mock.upsert });
  mock.select.mockReturnValue({ eq: mock.eq, single: mock.single });
  mock.eq.mockReturnValue({ maybeSingle: mock.maybeSingle });
  mock.upsert.mockReturnValue({ select: mock.select });
  mock.createClient.mockReturnValue({
    auth: {
      getUser: mock.getUser,
      verifyOtp: mock.verifyOtp,
      updateUser: mock.updateUser,
      signInWithPassword: mock.signInWithPassword,
    },
    from: mock.from,
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("public project configuration", () => {
  it("round-trips connection details in the fragment without session tokens", () => {
    vi.stubGlobal("location", { origin: "https://encaixe.test", pathname: "/app/" });
    const email = "ana+work@example.com";
    const link = new URL(connectionLink(config, email));
    expect(link.origin + link.pathname).toBe("https://encaixe.test/app/");
    expect(link.search).toBe("");
    expect(link.hash).toBe(
      `#/conectar?u=${encodeURIComponent(config.url)}&k=${encodeURIComponent(config.key)}&e=${encodeURIComponent(email)}`,
    );
    expect(readConnectionLink(link.hash)).toEqual({ config, email });
    expect(readConnectionLink(new URL(connectionLink(config)).hash)).toEqual({ config });
  });
  it("rejects secret keys, invalid URLs, and invalid emails in connection links", () => {
    const hash = (url: string, key: string) =>
      `#/conectar?u=${encodeURIComponent(url)}&k=${encodeURIComponent(key)}`;
    const serviceRole = `header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`;
    expect(readConnectionLink(hash(config.url, "sb_secret_private"))).toBeUndefined();
    expect(readConnectionLink(hash(config.url, serviceRole))).toBeUndefined();
    expect(readConnectionLink(hash("invalid", config.key))).toBeUndefined();
    expect(readConnectionLink(hash("http://example.com", config.key))).toBeUndefined();
    expect(readConnectionLink(hash(config.url, ""))).toBeUndefined();
    expect(readConnectionLink(`${hash(config.url, config.key)}&e=invalid`)).toBeUndefined();
  });
  it("ignores hashes outside the connection route and incomplete links", () => {
    for (const hash of ["", "#/", "#/vaga", "#/conectar", "#/conectar?", "#/conectar/other?u=x&k=y"])
      expect(readConnectionLink(hash)).toBeUndefined();
  });
  it("accepts HTTPS and local HTTP only", () => {
    expect(validateConfig(config.url, config.key)).toBeUndefined();
    expect(validateConfig("http://localhost:54321", "anon")).toBeUndefined();
    expect(validateConfig("http://127.0.0.1:54321", "anon")).toBeUndefined();
    for (const url of ["http://example.com", "ftp://localhost", "invalid", "http://localhost.evil.test"])
      expect(validateConfig(url, "anon")).toBe("invalid_url");
    expect(validateConfig(config.url, "  ")).toBe("missing_key");
  });
  it("rejects secret keys including base64url service-role JWTs", () => {
    const jwt = (role: string) =>
      `header.${btoa(JSON.stringify({ role })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.signature`;
    expect(validateConfig(config.url, " sb_secret_private ")).toBe("secret_key");
    expect(validateConfig(config.url, jwt("service_role"))).toBe("secret_key");
    expect(validateConfig(config.url, jwt("anon"))).toBeUndefined();
  });
  it("loads, validates, and clears persisted public configuration", () => {
    expect(loadSyncConfig()).toBeUndefined();
    expect(saveSyncConfig(config)).toBe(true);
    expect(loadSyncConfig()).toEqual(config);
    expect(saveSyncConfig({ ...config, key: "sb_secret_private" })).toBe(false);
    localStorage.setItem("encaixe.supabase", JSON.stringify({ ...config, key: "sb_secret_private" }));
    expect(loadSyncConfig()).toBeUndefined();
    expect(clearSyncConfig()).toBe(true);
    expect(loadSyncConfig()).toBeUndefined();
  });
  it("fails safely when storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error();
      },
      setItem() {
        throw new Error();
      },
      removeItem() {
        throw new Error();
      },
    });
    expect(loadSyncConfig()).toBeUndefined();
    expect(saveSyncConfig(config)).toBe(false);
    expect(clearSyncConfig()).toBe(false);
    expect(loadLastSync()).toBeUndefined();
    expect(() => clearLastSync()).toThrow("storage");
  });
  it("keeps sync baselines separate across projects and logins", () => {
    const last = { bankJson: "{}", remoteUpdatedAt: "2026-11-10T12:00:00Z" };
    saveLastSync(last, "project/person-a");
    expect(loadLastSync("project/person-a")).toMatchObject(last);
    expect(loadLastSync("project/person-b")).toBeUndefined();
    clearLastSync();
    expect(loadLastSync("project/person-a")).toBeUndefined();
  });
  it("memoizes clients and configures PKCE", async () => {
    const unique = { ...config, url: "https://memo.supabase.co" };
    const first = await getClient(unique);
    expect(await getClient(unique)).toBe(first);
    expect(mock.createClient).toHaveBeenCalledTimes(1);
    expect(mock.createClient).toHaveBeenCalledWith(unique.url, unique.key, {
      auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true },
    });
    await expect(getClient({ ...unique, key: "sb_secret_private" })).rejects.toMatchObject({
      code: "secret_key",
    });
  });
});

describe("remote boundary", () => {
  beforeEach(() => {
    saveSyncConfig(config);
  });
  it("sets the password and preserves Supabase error details", async () => {
    mock.updateUser.mockResolvedValue({ error: null });
    await setPassword("password123");
    expect(mock.updateUser).toHaveBeenCalledWith({ password: "password123" });
    mock.updateUser.mockResolvedValue({ error: { status: 422, message: "Password is too weak" } });
    await expect(setPassword("password123")).rejects.toMatchObject({
      code: "api",
      detail: expect.stringContaining("Password is too weak"),
    });
  });
  it("signs in with a password and distinguishes invalid credentials", async () => {
    mock.signInWithPassword.mockResolvedValue({ error: null });
    await signInWithPassword("ana@example.com", "password123");
    expect(mock.signInWithPassword).toHaveBeenCalledWith({
      email: "ana@example.com",
      password: "password123",
    });
    for (const error of [
      { status: 400, code: "invalid_credentials" },
      { status: 400, name: "AuthApiError", message: "Invalid login credentials" },
    ]) {
      mock.signInWithPassword.mockResolvedValue({ error });
      await expect(signInWithPassword("ana@example.com", "wrong")).rejects.toMatchObject({
        code: "invalid_credentials",
        detail: expect.any(String),
      });
    }
    mock.signInWithPassword.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(signInWithPassword("ana@example.com", "password123")).rejects.toMatchObject({
      code: "network",
    });
  });
  it("verifies the email code and maps authentication and network errors", async () => {
    mock.verifyOtp.mockResolvedValue({ error: null });
    await verifyCode("ana@example.com", "123456");
    expect(mock.verifyOtp).toHaveBeenCalledWith({ email: "ana@example.com", token: "123456", type: "email" });
    mock.verifyOtp.mockResolvedValue({ error: { name: "AuthApiError", status: 403 } });
    await expect(verifyCode("ana@example.com", "000000")).rejects.toMatchObject({ code: "auth" });
    mock.verifyOtp.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(verifyCode("ana@example.com", "123456")).rejects.toMatchObject({ code: "network" });
  });
  it("scopes queries to the signed-in user and validates remote banks", async () => {
    mock.maybeSingle.mockResolvedValue({
      data: { bank: sampleBank, updated_at: "2026-11-10T12:00:00Z" },
      error: null,
    });
    const remote = await fetchRemote();
    expect(JSON.parse(remote!.bankJson)).toEqual(bank);
    expect(mock.eq).toHaveBeenCalledWith("user_id", "user-id");
    mock.maybeSingle.mockResolvedValue({
      data: { bank: { facts: [] }, updated_at: "2026-11-10T12:00:00Z" },
      error: null,
    });
    await expect(fetchRemote()).rejects.toMatchObject({ code: "invalid_remote" });
    expect(mock.upsert).not.toHaveBeenCalled();
  });
  it("handles an absent remote bank", async () => {
    mock.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await fetchRemote()).toBeUndefined();
  });
  it("uses the server-returned update time after upserting", async () => {
    mock.single.mockResolvedValue({ data: { updated_at: "2026-11-10T13:00:00Z" }, error: null });
    expect(await pushRemote(bank)).toBe("2026-11-10T13:00:00Z");
    expect(mock.upsert).toHaveBeenCalledWith({ user_id: "user-id", bank, updated_at: expect.any(String) });
  });
  it("maps missing tables, network failures and authorization failures", () => {
    expect(syncError({ code: "42P01" }).code).toBe("table_missing");
    expect(syncError({ code: "PGRST205" }).code).toBe("table_missing");
    expect(syncError(new TypeError("Failed to fetch")).code).toBe("network");
    expect(syncError({ status: 401 }).code).toBe("auth");
    expect(syncError({ code: "42501" }).code).toBe("auth");
    expect(syncError({ message: "other" }).code).toBe("api");
  });
});

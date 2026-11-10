import { useCallback, useEffect, useRef, useState } from "react";
import { FactBankSchema, type FactBank } from "@encaixe/core";
import { loadBank, loadBankSavedAt, saveBank } from "../bank/storage";
import { decideSync, type Remote } from "./decide";
import {
  clearLastSync,
  clearSyncConfig,
  currentEmail,
  fetchRemote,
  getClient,
  loadLastSync,
  loadSyncConfig,
  pushRemote,
  saveLastSync,
  saveSyncConfig,
  sendMagicLink,
  signInWithPassword,
  signOut,
  SyncError,
  syncError,
  verifyCode,
  type SyncConfig,
  type SyncErrorCode,
} from "./supabase";

type Summary = { count: number; date?: string };
export type SyncState =
  | { status: "off" | "signed_out" | "syncing" }
  | { status: "idle"; email: string; syncedAt?: string }
  | { status: "conflict"; local: Summary; remote: Summary }
  | { status: "error"; code: SyncErrorCode; detail?: string };

const pickError = (error: unknown) => {
  const { code, detail } = syncError(error);
  return detail ? { code, detail } : { code };
};

export function useSync(onPulled: (bank: FactBank) => void) {
  const [config, setConfig] = useState(loadSyncConfig);
  const [state, setState] = useState<SyncState>({ status: config ? "syncing" : "off" });
  const callback = useRef(onPulled);
  callback.current = onPulled;
  const locked = useRef(false);
  const active = useRef(false);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const session = useRef<string | undefined>(undefined);
  const conflict = useRef<{ localJson: string | undefined; remote: Remote } | undefined>(undefined);
  const runRef = useRef<() => Promise<void>>(async () => {});

  const sync = useCallback(async (choice?: "local" | "remote") => {
    if (locked.current || !active.current) return;
    const settings = loadSyncConfig();
    if (!settings) {
      setState({ status: "off" });
      return;
    }
    locked.current = true;
    clearTimeout(timer.current);
    setState({ status: "syncing" });
    try {
      const email = await currentEmail();
      if (!active.current) return;
      session.current = email;
      if (!email) {
        setState({ status: "signed_out" });
        return;
      }
      const remote = await fetchRemote();
      if (!active.current) return;
      let remoteValue: unknown;
      try {
        remoteValue = remote ? JSON.parse(remote.bankJson) : undefined;
      } catch {
        throw new SyncError("invalid_remote");
      }
      const remoteBank = remote ? FactBankSchema.safeParse(remoteValue) : undefined;
      if (remoteBank && !remoteBank.success) throw new SyncError("invalid_remote");
      const stored = loadBank();
      if (stored.status === "invalid") throw new SyncError("invalid_local");
      const local = stored.status === "ok" ? stored.bank : undefined;
      const localJson = local ? JSON.stringify(local) : undefined;
      const owner = JSON.stringify([settings.url, email]);
      const last = loadLastSync(owner);
      let decision = decideSync(localJson, remote, last);
      if (choice && conflict.current) {
        const unchanged =
          conflict.current.localJson === localJson &&
          conflict.current.remote?.bankJson === remote?.bankJson &&
          conflict.current.remote?.updatedAt === remote?.updatedAt;
        if (unchanged) decision = choice === "local" ? "push" : "pull";
        else if (decision !== "same") decision = "conflict";
      }
      if (decision === "conflict") {
        conflict.current = { localJson, remote };
        setState({
          status: "conflict",
          local: { count: local?.facts.length ?? 0, date: loadBankSavedAt() },
          remote: { count: remoteBank?.success ? remoteBank.data.facts.length : 0, date: remote?.updatedAt },
        });
        return;
      }
      // ponytail: sem trava otimista no servidor; janela de corrida pequena entre ler e gravar.
      let syncedAt = remote?.updatedAt;
      if (decision === "push" && local) syncedAt = await pushRemote(local);
      if (!active.current) return;
      if (decision === "pull" && remoteBank?.success) {
        if (!saveBank(remoteBank.data)) throw new SyncError("storage");
        callback.current(remoteBank.data);
      }
      const bankJson = decision === "pull" ? remote?.bankJson : localJson;
      if (bankJson !== undefined && syncedAt) saveLastSync({ bankJson, remoteUpdatedAt: syncedAt }, owner);
      conflict.current = undefined;
      setState({ status: "idle", email, syncedAt: new Date().toISOString() });
    } catch (error) {
      if (active.current) setState({ status: "error", ...pickError(error) });
    } finally {
      locked.current = false;
      if (pending.current && active.current) {
        pending.current = false;
        timer.current = setTimeout(() => void runRef.current(), 1500);
      }
    }
  }, []);
  runRef.current = sync;

  useEffect(() => {
    active.current = true;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    if (config) {
      const authDescription = new URL(location.href).searchParams.get("error_description");
      void getClient(config)
        .then(async (client) => {
          const { error } = await client.auth.getSession();
          if (disposed) return;
          const url = new URL(location.href);
          const authParams = ["code", "error", "error_code", "error_description"];
          if (authParams.some((name) => url.searchParams.has(name))) {
            for (const name of authParams) url.searchParams.delete(name);
            history.replaceState(history.state, "", url.pathname + url.search + url.hash);
          }
          if (authDescription !== null) setState({ status: "error", code: "auth" });
          else if (error) throw error;
          else void sync();
          const { data } = client.auth.onAuthStateChange((event, nextSession) => {
            if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
              session.current = nextSession?.user.email;
              queueMicrotask(() => {
                if (!disposed && authDescription === null) void runRef.current();
              });
            }
          });
          unsubscribe = () => data.subscription.unsubscribe();
        })
        .catch((error) => {
          if (!disposed) setState({ status: "error", ...pickError(error) });
        });
    }
    return () => {
      disposed = true;
      active.current = false;
      clearTimeout(timer.current);
      unsubscribe?.();
    };
  }, [config, sync]);

  function afterLocalSave(_bank: FactBank) {
    if (!session.current) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (locked.current) pending.current = true;
      else void sync();
    }, 1500);
  }
  async function disconnect(remove = false) {
    if (locked.current) return;
    locked.current = true;
    clearTimeout(timer.current);
    try {
      try {
        await signOut();
      } catch (error) {
        // Remover a conexão não pode depender da rede: a sessão local some com a configuração.
        if (!remove) throw error;
      }
      clearLastSync();
      session.current = undefined;
      conflict.current = undefined;
      if (remove) {
        if (!clearSyncConfig()) throw new SyncError("storage");
        setConfig(undefined);
      }
      setState({ status: remove ? "off" : "signed_out" });
    } catch (error) {
      setState({ status: "error", ...pickError(error) });
    } finally {
      locked.current = false;
    }
  }
  return {
    state,
    sync,
    afterLocalSave,
    resolve: (choice: "local" | "remote") => sync(choice),
    disconnect,
    connect(settings: SyncConfig): boolean {
      try {
        clearLastSync();
        if (!saveSyncConfig(settings)) throw new SyncError("storage");
        setConfig(settings);
        return true;
      } catch (error) {
        setState({ status: "error", ...pickError(error) });
        return false;
      }
    },
    async sendLink(email: string): Promise<boolean> {
      try {
        await sendMagicLink(email);
        return true;
      } catch (error) {
        setState({ status: "error", ...pickError(error) });
        return false;
      }
    },
    async verifyCode(email: string, token: string): Promise<boolean> {
      try {
        await verifyCode(email, token);
        await sync();
        return true;
      } catch (error) {
        setState({ status: "error", ...pickError(error) });
        return false;
      }
    },
    async signInWithPassword(email: string, password: string): Promise<boolean> {
      try {
        await signInWithPassword(email, password);
        await sync();
        return true;
      } catch (error) {
        setState({ status: "error", ...pickError(error) });
        return false;
      }
    },
  };
}

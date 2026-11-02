import { messageOf, UsageError } from "./errors";
import type { Credential, UsageProvider } from "./providers/types";
import type { ProviderSnapshot, UsageErrorInfo } from "./usage";

export interface UsageEntry {
  provider: UsageProvider;
  providerID: string;
  name: string;
  integrationID: string;
}

export interface UsageServiceOptions {
  resolveCredential(entry: UsageEntry): Promise<Credential | undefined>;
  onRefresh: (providerID: string, fetchedAt: number) => void;
}

export interface UsageService {
  get(entry: UsageEntry): Promise<ProviderSnapshot | undefined>;
  all(entries: readonly UsageEntry[]): Promise<ProviderSnapshot[]>;
  dispose(): void;
}

const TTL_MS = 60_000;
const STATE_KEY = Symbol.for("opencode-usage.state");

type CachedUsage = Omit<ProviderSnapshot, "name">;

type CacheEntry = {
  usage: CachedUsage;
  expires: number;
};

type SharedState = {
  cache: Map<string, CacheEntry>;
  inflight: Map<string, Promise<CachedUsage | undefined>>;
  listeners: Set<(providerID: string, fetchedAt: number) => void>;
  lastTimestamp: number;
};

function sharedState(): SharedState {
  const store = globalThis as unknown as Record<symbol, SharedState | undefined>;
  let shared = store[STATE_KEY];
  if (!shared) {
    shared = {
      cache: new Map(),
      inflight: new Map(),
      listeners: new Set(),
      lastTimestamp: 0,
    };
    store[STATE_KEY] = shared;
  }
  return shared;
}

function timestamp(): number {
  const shared = sharedState();
  shared.lastTimestamp = Math.max(Date.now(), shared.lastTimestamp + 1);
  return shared.lastTimestamp;
}

function keyOf(entry: UsageEntry): string {
  return `${entry.providerID}:${entry.integrationID}`;
}

function toErrorInfo(error: unknown): UsageErrorInfo {
  if (error instanceof UsageError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "failed",
    message: messageOf(error),
  };
}

function baseUsage(
  providerID: string,
  account: string | undefined,
): Pick<CachedUsage, "providerID" | "account" | "fetchedAt"> {
  return {
    providerID,
    ...(account ? { account } : {}),
    fetchedAt: timestamp(),
  };
}

function failedUsage(
  entry: UsageEntry,
  account: string | undefined,
  error: unknown,
): CachedUsage {
  return {
    ...baseUsage(entry.providerID, account),
    windows: [],
    error: toErrorInfo(error),
  };
}

async function load(
  entry: UsageEntry,
  options: UsageServiceOptions,
): Promise<CachedUsage | undefined> {
  let credential: Credential | undefined;
  try {
    credential = await options.resolveCredential(entry);
  } catch (error) {
    return failedUsage(
      entry,
      error instanceof UsageError ? error.account : undefined,
      error,
    );
  }
  if (!credential) return undefined;
  try {
    return {
      ...baseUsage(entry.providerID, credential.label || undefined),
      windows: await entry.provider.fetch(credential),
    };
  } catch (error) {
    return failedUsage(entry, credential.label || undefined, error);
  }
}

function snapshotOf(usage: CachedUsage, name: string): ProviderSnapshot {
  return { ...usage, name };
}

function get(
  entry: UsageEntry,
  options: UsageServiceOptions,
): Promise<ProviderSnapshot | undefined> {
  const key = keyOf(entry);
  const shared = sharedState();
  const cached = shared.cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return Promise.resolve(snapshotOf(cached.usage, entry.name));
  }
  if (cached) shared.cache.delete(key);

  let pending = shared.inflight.get(key);
  if (!pending) {
    let created: Promise<CachedUsage | undefined>;
    created = load(entry, options).then((usage) => {
      if (usage && shared.inflight.get(key) === created) {
        shared.cache.set(key, { usage, expires: Date.now() + TTL_MS });
        for (const listener of shared.listeners) {
          listener(usage.providerID, usage.fetchedAt);
        }
      }
      return usage;
    });
    shared.inflight.set(key, created);
    const cleanup = () => {
      if (shared.inflight.get(key) === created) shared.inflight.delete(key);
    };
    created.then(cleanup, cleanup);
    pending = created;
  }
  return pending.then((usage) => (usage ? snapshotOf(usage, entry.name) : undefined));
}

export function createUsageService(options: UsageServiceOptions): UsageService {
  sharedState().listeners.add(options.onRefresh);
  return {
    get: (entry) => get(entry, options),
    all: async (entries) => {
      const snapshots = await Promise.all(entries.map((entry) => get(entry, options)));
      return snapshots.filter(
        (snapshot): snapshot is ProviderSnapshot => snapshot !== undefined,
      );
    },
    dispose: () => {
      sharedState().listeners.delete(options.onRefresh);
    },
  };
}

export function invalidateUsageCache(): void {
  const shared = sharedState();
  shared.cache.clear();
  shared.inflight.clear();
}

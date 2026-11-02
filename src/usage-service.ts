import { messageOf, UsageError } from "./errors";
import { accountKeyOf } from "./providers/account-key";
import type { Credential, UsageProvider } from "./providers/types";
import type { ProviderListing, ProviderSnapshot, UsageErrorInfo } from "./usage";

export interface UsageEntry {
  provider: UsageProvider;
  providerID: string;
  providerName: string;
  integrationID: string;
}

export interface UsageServiceOptions {
  resolveCredential(entry: UsageEntry): Promise<Credential | undefined>;
  onRefresh: (providerID: string, fetchedAt: number) => void;
}

export interface UsageService {
  get(entry: UsageEntry, bypassCache?: boolean): Promise<ProviderSnapshot | undefined>;
  list(entries: readonly UsageEntry[]): Promise<ProviderListing[]>;
  all(entries: readonly UsageEntry[], bypassCache?: boolean): Promise<ProviderSnapshot[]>;
  dispose(): void;
}

const TTL_MS = 60_000;
const STATE_KEY = Symbol.for("opencode-usage.state");

type CachedUsage = Omit<ProviderSnapshot, "providerName">;

type CacheEntry = {
  usage: CachedUsage;
  expires: number;
};

type InflightEntry = {
  promise: Promise<CachedUsage | undefined>;
  bypass: boolean;
};

type SharedState = {
  cache: Map<string, CacheEntry>;
  inflight: Map<string, InflightEntry>;
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

type AccountIdentity = Pick<ProviderListing, "accountLabel" | "accountKey">;

function accountIdentityOf(entry: UsageEntry, credential: Credential): AccountIdentity {
  return {
    ...(credential.label ? { accountLabel: credential.label } : {}),
    accountKey: accountKeyOf(entry.provider.id, credential),
  };
}

function baseUsage(
  entry: UsageEntry,
  identity: AccountIdentity,
): Pick<CachedUsage, "providerID" | "accountLabel" | "accountKey" | "fetchedAt"> {
  return {
    providerID: entry.providerID,
    ...identity,
    fetchedAt: timestamp(),
  };
}

function failedUsage(
  entry: UsageEntry,
  identity: AccountIdentity,
  error: unknown,
): CachedUsage {
  return {
    ...baseUsage(entry, identity),
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
    const accountLabel = error instanceof UsageError ? error.accountLabel : undefined;
    return failedUsage(
      entry,
      { ...(accountLabel ? { accountLabel } : {}), accountKey: null },
      error,
    );
  }
  if (!credential) return undefined;

  const identity = accountIdentityOf(entry, credential);
  if (!entry.provider.accepts(credential)) {
    return failedUsage(
      entry,
      identity,
      new UsageError(
        "unavailable",
        `Cannot read usage for ${entry.providerName} with the active ${credential.kind} credential`,
      ),
    );
  }

  try {
    return {
      ...baseUsage(entry, identity),
      windows: await entry.provider.fetch(credential),
    };
  } catch (error) {
    return failedUsage(entry, identity, error);
  }
}

function snapshotOf(usage: CachedUsage, providerName: string): ProviderSnapshot {
  return { ...usage, providerName };
}

function get(
  entry: UsageEntry,
  options: UsageServiceOptions,
  bypassCache: boolean,
): Promise<ProviderSnapshot | undefined> {
  const key = keyOf(entry);
  const shared = sharedState();
  if (!bypassCache) {
    const cached = shared.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return Promise.resolve(snapshotOf(cached.usage, entry.providerName));
    }
    if (cached) shared.cache.delete(key);
  }

  const inflight = shared.inflight.get(key);
  let pending =
    inflight && (!bypassCache || inflight.bypass) ? inflight.promise : undefined;

  if (!pending) {
    let created: Promise<CachedUsage | undefined>;
    created = load(entry, options).then((usage) => {
      if (usage && shared.inflight.get(key)?.promise === created) {
        shared.cache.set(key, { usage, expires: Date.now() + TTL_MS });
        for (const listener of shared.listeners) {
          listener(usage.providerID, usage.fetchedAt);
        }
      }
      return usage;
    });
    const tracked = { promise: created, bypass: bypassCache };
    shared.inflight.set(key, tracked);
    const cleanup = () => {
      if (shared.inflight.get(key) === tracked) shared.inflight.delete(key);
    };
    created.then(cleanup, cleanup);
    pending = created;
  }
  return pending.then((usage) =>
    usage ? snapshotOf(usage, entry.providerName) : undefined,
  );
}

async function list(
  entries: readonly UsageEntry[],
  options: UsageServiceOptions,
): Promise<ProviderListing[]> {
  const listed = await Promise.all(
    entries.map(async (entry) => {
      try {
        const credential = await options.resolveCredential(entry);
        if (!credential) return undefined;
        return {
          providerID: entry.providerID,
          providerName: entry.providerName,
          ...accountIdentityOf(entry, credential),
        };
      } catch {
        return undefined;
      }
    }),
  );
  return listed.filter((entry): entry is ProviderListing => entry !== undefined);
}

export function createUsageService(options: UsageServiceOptions): UsageService {
  sharedState().listeners.add(options.onRefresh);
  return {
    get: (entry, bypassCache = false) => get(entry, options, bypassCache),
    list: (entries) => list(entries, options),
    all: async (entries, bypassCache = false) => {
      const snapshots = await Promise.all(
        entries.map((entry) => get(entry, options, bypassCache)),
      );
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

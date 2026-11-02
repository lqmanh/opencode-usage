import type { ConnectionInfo, ProviderInfo } from "@opencode/client";
import { Plugin } from "@opencode/plugin";
import { messageOf, UsageError } from "./errors";
import { isRecord } from "./http";
import { findProvider } from "./providers";
import {
  credentialFromValue,
  type Credential,
  type CredentialValue,
} from "./providers/types";
import { USAGE_INVALIDATION_EVENTS, usageRpc } from "./rpc";
import {
  createUsageService,
  invalidateUsageCache,
  type UsageEntry,
} from "./usage-service";

type ProviderDirectory = {
  list(): Promise<{ data: readonly ProviderInfo[] }>;
  get(input: { providerID: string }): Promise<{ data: ProviderInfo }>;
};

type IntegrationDirectory = Plugin.Context["integration"];

type GetInput = {
  providerID?: string;
  bypassCache: boolean;
};

function readGetInput(input: unknown): GetInput {
  if (!isRecord(input)) return { bypassCache: false };
  return {
    providerID: typeof input.providerID === "string" ? input.providerID : undefined,
    bypassCache: input.bypassCache === true,
  };
}

function integrationFor(info: ProviderInfo): string {
  return info.integrationID ?? info.id;
}

function entryFor(info: ProviderInfo): UsageEntry | undefined {
  if (info.activation === "disabled") return undefined;
  const provider = findProvider(info.id);
  if (!provider) return undefined;
  return {
    provider,
    providerID: info.id,
    providerName: info.name,
    integrationID: integrationFor(info),
  };
}

async function providerEntries(provider: ProviderDirectory): Promise<UsageEntry[]> {
  const infos = (await provider.list()).data;
  const chosen = new Map<string, UsageEntry>();
  for (const info of infos) {
    const entry = entryFor(info);
    if (!entry || chosen.has(entry.providerID)) continue;
    chosen.set(entry.providerID, entry);
  }
  return [...chosen.values()];
}

async function singleEntry(
  provider: ProviderDirectory,
  providerID: string,
): Promise<UsageEntry | undefined> {
  try {
    const info = (await provider.get({ providerID })).data;
    return entryFor(info);
  } catch {
    return undefined;
  }
}

async function resolveCredential(
  integration: IntegrationDirectory,
  entry: UsageEntry,
): Promise<Credential | undefined> {
  let active: ConnectionInfo | undefined;
  let value: CredentialValue | undefined;
  try {
    active = await integration.connection.active(entry.integrationID);
    if (!active) return undefined;
    value = await integration.connection.resolve(active);
  } catch (error) {
    throw new UsageError(
      "expired",
      `Could not resolve ${entry.providerName} credentials: ${messageOf(error)}`,
      active?.type === "credential" ? active.label : active?.name,
    );
  }
  if (!active || !value) return undefined;

  const label = active.type === "credential" ? active.label : active.name;
  return credentialFromValue(entry.integrationID, value, label);
}

export default Plugin.define({
  id: "opencode-usage",
  async setup(context) {
    let emit: ((providerID: string, fetchedAt: number) => void) | undefined;
    const service = createUsageService({
      resolveCredential: (entry) => resolveCredential(context.integration, entry),
      onRefresh: (providerID, fetchedAt) => emit?.(providerID, fetchedAt),
    });

    const registration = await context.rpc.register(usageRpc, {
      list: async (_input, call) => {
        try {
          const entries = await providerEntries(context.provider);
          return { providers: await service.list(entries) };
        } catch (error) {
          return call.error("internal", messageOf(error), {});
        }
      },
      get: async (input, call) => {
        const { providerID, bypassCache } = readGetInput(input);
        try {
          if (providerID !== undefined) {
            const entry = await singleEntry(context.provider, providerID);
            if (!entry) return { providers: [] };
            const snapshot = await service.get(entry, bypassCache);
            return { providers: snapshot ? [snapshot] : [] };
          }
          const entries = await providerEntries(context.provider);
          return { providers: await service.all(entries, bypassCache) };
        } catch (error) {
          return call.error(
            "internal",
            messageOf(error),
            providerID ? { providerID } : {},
          );
        }
      },
    });

    emit = (providerID, fetchedAt) => {
      void registration.events
        .emit("updated", { providerID, fetchedAt })
        .catch(() => undefined);
    };

    const controller = new AbortController();
    void (async () => {
      for await (const _event of context.event.subscribe({
        types: USAGE_INVALIDATION_EVENTS,
        signal: controller.signal,
      })) {
        invalidateUsageCache();
      }
    })().catch(() => undefined);

    return async () => {
      controller.abort();
      service.dispose();
      emit = undefined;
      await registration.dispose();
    };
  },
});

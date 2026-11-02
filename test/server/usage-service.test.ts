import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { UsageProvider } from "../../src/server/providers/types";
import {
  createUsageService,
  invalidateUsageCache,
  type UsageEntry,
  type UsageService,
  type UsageServiceOptions,
} from "../../src/server/usage-service";
import type { UsageWindow } from "../../src/shared/usage";
import { credential, provider } from "./fixtures";

function window(percent: number): UsageWindow[] {
  return [{ id: "rolling", label: "5h", percent, resetsAt: "" }];
}

function entry(
  provider: UsageProvider,
  providerID: string,
  providerName: string,
): UsageEntry {
  return {
    provider,
    providerID,
    providerName,
    integrationID: `${providerID}-integration`,
  };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const services: UsageService[] = [];

function createService(options: UsageServiceOptions): UsageService {
  const service = createUsageService(options);
  services.push(service);
  return service;
}

beforeEach(() => {
  invalidateUsageCache();
});

afterEach(() => {
  for (const service of services.splice(0)) service.dispose();
  invalidateUsageCache();
});

describe("list", () => {
  test("resolves credentials without fetching usage", async () => {
    let fetches = 0;
    const openai = provider(
      "openai",
      async () => {
        fetches++;
        return window(10);
      },
      () => false,
      () => "openai:account:acct_123",
    );
    const service = createService({
      resolveCredential: async (entry) => {
        if (entry.providerID === "broken") throw new Error("boom");
        if (entry.providerID !== "openai") return undefined;
        return credential({ metadata: { accountID: "acct_123" } });
      },
      onRefresh: () => {},
    });

    const listed = await service.list([
      entry(openai, "openai", "OpenAI"),
      entry(openai, "missing", "Missing"),
      entry(openai, "broken", "Broken"),
    ]);

    expect(fetches).toBe(0);
    expect(listed).toEqual([
      {
        providerID: "openai",
        providerName: "OpenAI",
        accountLabel: "Work",
        accountKey: "openai:account:acct_123",
      },
    ]);
  });
});

describe("get", () => {
  test("includes accountKey in successful and unavailable snapshots", async () => {
    let fetches = 0;
    const fetching = provider(
      "openai",
      async () => {
        fetches++;
        return window(10);
      },
      () => true,
      () => "openai:account:acct_123",
    );
    const blocked = provider(
      "openai",
      async () => {
        fetches++;
        return window(10);
      },
      () => false,
      () => "openai:account:acct_123",
    );
    const service = createService({
      resolveCredential: async () => credential({ metadata: { accountID: "acct_123" } }),
      onRefresh: () => {},
    });

    const snapshot = await service.get(entry(fetching, "openai", "OpenAI"));
    expect(snapshot?.providerName).toBe("OpenAI");
    expect(snapshot?.accountLabel).toBe("Work");
    expect(snapshot?.accountKey).toBe("openai:account:acct_123");
    expect(fetches).toBe(1);

    const unavailable = await service.get(entry(blocked, "blocked", "Blocked"));
    expect(unavailable?.error?.code).toBe("unavailable");
    expect(unavailable?.accountKey).toBe("openai:account:acct_123");
    expect(fetches).toBe(1);
  });

  test("bypassCache skips the cache and refreshes it", async () => {
    let fetches = 0;
    const openai = provider("openai", async () => {
      fetches++;
      return window(fetches * 10);
    });
    const events: string[] = [];
    const service = createService({
      resolveCredential: async () => credential({ metadata: { accountID: "acct_123" } }),
      onRefresh: (providerID) => events.push(providerID),
    });
    const current = entry(openai, "openai-bypass", "OpenAI");

    expect((await service.get(current))?.windows[0]?.percent).toBe(10);
    expect((await service.get(current))?.windows[0]?.percent).toBe(10);
    expect(fetches).toBe(1);

    expect((await service.get(current, true))?.windows[0]?.percent).toBe(20);
    expect((await service.get(current))?.windows[0]?.percent).toBe(20);
    expect(fetches).toBe(2);
    expect(events).toEqual(["openai-bypass", "openai-bypass"]);
  });

  test("bypassCache does not join an older non-bypass request", async () => {
    const resolvers: Array<(windows: UsageWindow[]) => void> = [];
    let fetches = 0;
    const openai = provider(
      "openai",
      () =>
        new Promise((resolve) => {
          fetches++;
          resolvers.push(resolve);
        }),
    );
    const events: string[] = [];
    const service = createService({
      resolveCredential: async () => credential({ metadata: { accountID: "acct_123" } }),
      onRefresh: (providerID) => events.push(providerID),
    });
    const current = entry(openai, "openai-inflight", "OpenAI");

    const normal = service.get(current);
    await tick();
    expect(fetches).toBe(1);

    const bypass = service.get(current, true);
    await tick();
    expect(fetches).toBe(2);

    const joinedBypass = service.get(current, true);
    await tick();
    expect(fetches).toBe(2);

    resolvers[1](window(20));
    const [bypassResult, joinedBypassResult] = await Promise.all([bypass, joinedBypass]);
    expect(bypassResult?.windows[0]?.percent).toBe(20);
    expect(joinedBypassResult?.windows[0]?.percent).toBe(20);

    resolvers[0](window(10));
    expect((await normal)?.windows[0]?.percent).toBe(10);
    expect((await service.get(current))?.windows[0]?.percent).toBe(20);
    expect(fetches).toBe(2);
    expect(events).toEqual(["openai-inflight"]);
  });
});

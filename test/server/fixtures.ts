import { defineEndpointProvider } from "../../src/server/providers/helpers";
import type { Credential, UsageProvider } from "../../src/server/providers/types";

export function provider(
  id: string,
  fetch: UsageProvider["fetch"] = async () => [],
  accepts: UsageProvider["accepts"] = () => true,
  accountKey?: UsageProvider["accountKey"],
): UsageProvider {
  return {
    ...defineEndpointProvider(id, fetch),
    accepts,
    ...(accountKey ? { accountKey } : {}),
  };
}

export function credential(overrides: Partial<Credential> = {}): Credential {
  return {
    integrationID: "i",
    kind: "oauth",
    token: "t",
    label: "Work",
    metadata: {},
    ...overrides,
  };
}

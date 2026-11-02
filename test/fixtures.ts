import {
  defineEndpointProvider,
  type Credential,
  type UsageProvider,
} from "../src/providers/types";

export function provider(
  id: string,
  fetch: UsageProvider["fetch"] = async () => [],
  accepts: UsageProvider["accepts"] = () => true,
): UsageProvider {
  return { ...defineEndpointProvider(id, fetch), accepts };
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

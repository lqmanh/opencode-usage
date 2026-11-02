import type { Plugin } from "@opencode/plugin";
import type { UsageWindow } from "../usage";

export type CredentialValue = NonNullable<
  Awaited<ReturnType<Plugin.Context["integration"]["connection"]["resolve"]>>
>;

export type Credential = {
  integrationID: string;
  kind: "key" | "oauth" | "external";
  token: string;
  label: string;
  expires?: number;
  metadata: Record<string, unknown>;
};

export interface UsageProvider {
  id: string;
  accepts(credential: Credential): boolean;
  fetch(credential: Credential): Promise<UsageWindow[]>;
}

export function defineEndpointProvider(
  id: string,
  fetch: UsageProvider["fetch"],
): UsageProvider {
  return { id, accepts: () => true, fetch };
}

export function credentialFromValue(
  integrationID: string,
  value: CredentialValue,
  label: string,
): Credential {
  return {
    integrationID,
    kind: value.type,
    // External credentials are owned by another tool; their providers read the token.
    token: value.type === "oauth" ? value.access : value.type === "key" ? value.key : "",
    label,
    expires: value.type === "oauth" ? value.expires : undefined,
    metadata: value.metadata ?? {},
  };
}

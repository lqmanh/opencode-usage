import type { Credential } from "./types";

function prefixed(prefix: string, value: unknown): string | null {
  return typeof value === "string" && value !== "" ? `${prefix}${value}` : null;
}

export function accountKeyOf(providerID: string, credential: Credential): string | null {
  if (providerID === "openai") {
    return prefixed("openai:account:", credential.metadata.accountID);
  }
  if (providerID === "opencode-go" && credential.kind === "oauth") {
    return prefixed("opencode:organization:", credential.metadata.orgID);
  }
  return null;
}

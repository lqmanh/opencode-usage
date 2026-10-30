import type { CredentialEntry } from "@opencode/client";
import { claudeAgent } from "./claude-agent";
import { kimiCn, kimiGlobal } from "./kimi";
import { openai } from "./openai";
import { opencodeGo } from "./opencode-go";
import type { Credential, UsageProvider } from "./types";
import { zaiCodingPlan, zhipuaiCodingPlan } from "./zai";

const PROVIDERS: readonly UsageProvider[] = [
  opencodeGo,
  openai,
  claudeAgent,
  kimiCn,
  kimiGlobal,
  zaiCodingPlan,
  zhipuaiCodingPlan,
];

export function findProvider(
  providerID: string | undefined,
  canonical?: string,
): UsageProvider | undefined {
  if (!providerID) return undefined;
  return PROVIDERS.find(
    (provider) => provider.id === providerID || provider.id === canonical,
  );
}

function toCredential(entry: CredentialEntry): Credential {
  const value = entry.value;
  return {
    integrationID: entry.integrationID,
    kind: value.type,
    // External credentials are owned by another tool; their providers read the token.
    token: value.type === "oauth" ? value.access : value.type === "key" ? value.key : "",
    label: entry.label,
    expires: value.type === "oauth" ? value.expires : undefined,
    metadata: value.metadata ?? {},
  };
}

// Integration order defines preference; within an integration, active
// credentials are tried first and `accepts` filters the candidates.
export function resolveCredential(
  provider: UsageProvider,
  entries: readonly CredentialEntry[],
): Credential | undefined {
  for (const integration of provider.integrations) {
    let fallback: Credential | undefined;
    for (const entry of entries) {
      if (entry.integrationID !== integration) continue;
      const credential = toCredential(entry);
      if (!provider.accepts(credential)) continue;
      if (entry.active) return credential;
      fallback ??= credential;
    }
    if (fallback) return fallback;
  }
  return undefined;
}

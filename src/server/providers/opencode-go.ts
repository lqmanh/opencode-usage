import { UsageError } from "../../shared/errors";
import { isRecord } from "../../shared/guards";
import { WINDOW_LABELS, type UsageWindow, type WindowID } from "../../shared/usage";
import { fetchUsageJSON } from "../http";
import { expectUsageRecord, expectWindows, prefixed } from "./helpers";
import type { Credential, UsageProvider } from "./types";

// API keys use the zen endpoint; Console tokens use the inference gateway.
function endpointFor(credential: Credential) {
  return credential.kind === "oauth"
    ? "https://opencode.ai/inference/go/v1/usage"
    : "https://opencode.ai/zen/go/v1/usage";
}

function decodeUsage(input: unknown): UsageWindow[] {
  const usage = expectUsageRecord(input).usage;
  if (!isRecord(usage)) throw new Error("Usage response is missing the usage field");
  const read = (id: WindowID): UsageWindow => {
    const item = usage[id];
    if (!isRecord(item)) throw new Error(`Usage response is missing ${id}`);
    if (typeof item.percent !== "number" || typeof item.resetsAt !== "string") {
      throw new Error(`Usage response has an invalid ${id} window`);
    }
    return {
      id,
      label: WINDOW_LABELS[id],
      percent: item.percent,
      resetsAt: item.resetsAt,
    };
  };
  return expectWindows([read("rolling"), read("weekly"), read("monthly")]);
}

async function fetchUsage(credential: Credential): Promise<UsageWindow[]> {
  if (
    credential.kind === "oauth" &&
    credential.expires &&
    credential.expires < Date.now()
  ) {
    throw new UsageError(
      "expired",
      "Console credential expired - send a prompt with an OpenCode Go model to refresh it",
    );
  }
  // The inference gateway selects the org with `x-opencode-org-id`.
  const orgID = credential.metadata.orgID;
  const headers =
    credential.kind === "oauth" && typeof orgID === "string"
      ? { "x-opencode-org-id": orgID }
      : undefined;
  return decodeUsage(
    await fetchUsageJSON(endpointFor(credential), credential.token, headers),
  );
}

// Go API keys live under integration `opencode-go`; Console accounts under
// `opencode`.
export const opencodeGo: UsageProvider = {
  id: "opencode-go",
  // `opencode` keys are service accounts, not Go API keys.
  accepts: (credential) =>
    !(credential.integrationID === "opencode" && credential.kind === "key"),
  fetch: fetchUsage,
  accountKey: (credential) =>
    credential.kind === "oauth"
      ? prefixed("opencode:organization:", credential.metadata.orgID)
      : null,
};

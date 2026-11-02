import { epochToISO, fetchUsageJSON, isRecord, toNumber } from "../http";
import { WINDOW_LABELS, windowLabel, type UsageWindow } from "../usage";
import { expectUsageRecord, expectWindows } from "./decode";
import type { Credential, UsageProvider } from "./types";

const ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";

function readWindow(
  value: unknown,
  id: string,
  fallbackLabel: string,
): UsageWindow | undefined {
  if (!isRecord(value)) return undefined;
  const percent = toNumber(value.used_percent);
  if (percent === undefined) return undefined;
  const seconds = toNumber(value.limit_window_seconds);
  if (seconds !== undefined && seconds <= 0) return undefined;
  const label = seconds === undefined ? fallbackLabel : windowLabel(seconds / 60);
  return { id, label, percent, resetsAt: epochToISO(value.reset_at) };
}

function decodeUsage(input: unknown): UsageWindow[] {
  const record = expectUsageRecord(input);
  const rateLimit = record.rate_limit;
  if (!isRecord(rateLimit)) {
    throw new Error("Usage response is missing the rate_limit field");
  }
  const windows: UsageWindow[] = [];
  const primary = readWindow(rateLimit.primary_window, "rolling", WINDOW_LABELS.rolling);
  if (primary) windows.push(primary);
  const secondary = readWindow(
    rateLimit.secondary_window,
    "weekly",
    WINDOW_LABELS.weekly,
  );
  if (secondary) windows.push(secondary);
  return expectWindows(windows);
}

async function fetchUsage(credential: Credential): Promise<UsageWindow[]> {
  const accountID = credential.metadata.accountID;
  const headers =
    typeof accountID === "string" ? { "chatgpt-account-id": accountID } : undefined;
  return decodeUsage(await fetchUsageJSON(ENDPOINT, credential.token, headers));
}

export const openai: UsageProvider = {
  id: "openai",
  // ChatGPT subscription usage is only readable through an OAuth connection.
  accepts: (credential) => credential.kind === "oauth",
  fetch: fetchUsage,
};

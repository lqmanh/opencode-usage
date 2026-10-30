import { fetchUsageJSON, isRecord, toNumber } from "../http";
import {
  WINDOW_LABELS,
  expectUsageRecord,
  expectWindows,
  windowLabel,
  type UsageWindow,
} from "../usage";
import type { Credential, UsageProvider } from "./types";

const DEFAULT_WINDOW_MINUTES = 5 * 60;
const TIME_UNITS: Record<string, number> = { MINUTE: 1, HOUR: 60, DAY: 1440 };

function percentOf(quota: Record<string, unknown>): number | undefined {
  const limit = toNumber(quota.limit);
  if (limit === undefined || limit <= 0) return undefined;
  const remaining = toNumber(quota.remaining);
  const used =
    toNumber(quota.used) ?? (remaining !== undefined ? limit - remaining : undefined);
  if (used === undefined) return undefined;
  return (used / limit) * 100;
}

function resetOf(...quotas: Record<string, unknown>[]): string {
  for (const quota of quotas) {
    const value = quota.reset_at ?? quota.resetAt ?? quota.resetTime;
    if (typeof value === "string") return value;
  }
  return "";
}

function windowMinutes(window: unknown): number | undefined {
  if (!isRecord(window)) return undefined;
  const duration = toNumber(window.duration);
  const unit =
    typeof window.timeUnit === "string"
      ? TIME_UNITS[window.timeUnit.toUpperCase()]
      : undefined;
  if (duration === undefined || duration <= 0 || unit === undefined) return undefined;
  return duration * unit;
}

// The rolling window is the first limits row; its label follows the window
// descriptor whenever the payload provides one.
function rollingWindow(limits: unknown): UsageWindow | undefined {
  if (!Array.isArray(limits)) return undefined;
  const item = limits.find(isRecord);
  if (!item) return undefined;
  const detail = isRecord(item.detail) ? item.detail : item;
  return {
    id: "rolling",
    label: windowLabel(windowMinutes(item.window) ?? DEFAULT_WINDOW_MINUTES),
    percent: percentOf(detail) ?? 0,
    resetsAt: resetOf(detail, item),
  };
}

function decodeUsage(input: unknown): UsageWindow[] {
  const record = expectUsageRecord(input);
  const windows: UsageWindow[] = [];
  const rolling = rollingWindow(record.limits);
  if (rolling) windows.push(rolling);
  if (isRecord(record.usage)) {
    const percent = percentOf(record.usage);
    if (percent !== undefined) {
      windows.push({
        id: "weekly",
        label: WINDOW_LABELS.weekly,
        percent,
        resetsAt: resetOf(record.usage),
      });
    }
  }
  return expectWindows(windows);
}

async function fetchUsage(
  endpoint: string,
  credential: Credential,
): Promise<UsageWindow[]> {
  return decodeUsage(await fetchUsageJSON(endpoint, credential.token));
}

function defineKimi(id: string, endpoint: string): UsageProvider {
  return {
    id,
    integrations: [id],
    accepts: () => true,
    fetch: (credential) => fetchUsage(endpoint, credential),
  };
}

export const kimiCn = defineKimi(
  "kimi-code-plan-cn",
  "https://api.kimi.com/coding/v1/usages",
);
export const kimiGlobal = defineKimi(
  "kimi-code-plan-global",
  "https://api.kimi.ai/coding/v1/usages",
);

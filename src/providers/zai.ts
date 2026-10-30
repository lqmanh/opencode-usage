import { epochToISO, fetchUsageJSON, isRecord, toNumber } from "../http";
import {
  WINDOW_LABELS,
  expectUsageRecord,
  expectWindows,
  type UsageWindow,
} from "../usage";
import type { Credential, UsageProvider } from "./types";

type WindowData = {
  percent: number;
  resetsAt: string;
};

function readWindow(item: Record<string, unknown>): WindowData | undefined {
  const percent = toNumber(item.percentage);
  if (percent === undefined) return undefined;
  return { percent, resetsAt: epochToISO(item.nextResetTime) };
}

function decodeUsage(input: unknown): UsageWindow[] {
  const record = expectUsageRecord(input);
  if (record.success === false) {
    const message = typeof record.msg === "string" ? record.msg : "unknown error";
    throw new Error(`usage request was rejected: ${message}`);
  }
  const data = record.data;
  if (!isRecord(data)) throw new Error("usage response is missing the data field");
  if (!Array.isArray(data.limits)) {
    throw new Error("usage response is missing the limits field");
  }

  let fiveHour: WindowData | undefined;
  let weekly: WindowData | undefined;
  const unmatched: WindowData[] = [];
  for (const item of data.limits) {
    if (!isRecord(item) || item.type === "TIME_LIMIT") continue;
    const window = readWindow(item);
    if (!window) continue;
    if (item.unit === 3 && item.number === 5) fiveHour ??= window;
    else if (item.unit === 6) weekly ??= window;
    else unmatched.push(window);
  }
  fiveHour ??= unmatched.shift();
  weekly ??= unmatched.shift();

  const windows: UsageWindow[] = [];
  if (fiveHour)
    windows.push({ id: "rolling", label: WINDOW_LABELS.rolling, ...fiveHour });
  if (weekly) windows.push({ id: "weekly", label: WINDOW_LABELS.weekly, ...weekly });
  return expectWindows(windows);
}

async function fetchUsage(
  endpoint: string,
  credential: Credential,
): Promise<UsageWindow[]> {
  // The official usage plugin authenticates with the raw token, not Bearer:
  // https://github.com/zai-org/zai-coding-plugins
  return decodeUsage(
    await fetchUsageJSON(endpoint, credential.token, {
      Authorization: credential.token,
      "Accept-Language": "en-US,en",
      "Content-Type": "application/json",
    }),
  );
}

function defineZai(id: string, endpoint: string): UsageProvider {
  return {
    id,
    integrations: [id],
    accepts: () => true,
    fetch: (credential) => fetchUsage(endpoint, credential),
  };
}

export const zaiCodingPlan = defineZai(
  "zai-coding-plan",
  "https://api.z.ai/api/monitor/usage/quota/limit",
);
export const zhipuaiCodingPlan = defineZai(
  "zhipuai-coding-plan",
  "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
);

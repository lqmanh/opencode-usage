import { isRecord } from "../http";
import type { UsageWindow } from "../usage";

export function expectUsageRecord(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) throw new Error("Usage response was not an object");
  return input;
}

export function expectWindows(windows: UsageWindow[]): UsageWindow[] {
  if (windows.length === 0) throw new Error("Usage response carried no usage windows");
  return windows;
}

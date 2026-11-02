import { isRecord } from "../../shared/guards";
import type { UsageWindow } from "../../shared/usage";
import type { UsageProvider } from "./types";

export function defineEndpointProvider(
  id: string,
  fetch: UsageProvider["fetch"],
): UsageProvider {
  return { id, accepts: () => true, fetch };
}

export function prefixed(prefix: string, value: unknown): string | null {
  return typeof value === "string" && value !== "" ? `${prefix}${value}` : null;
}

export function expectUsageRecord(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) throw new Error("Usage response was not an object");
  return input;
}

export function expectWindows(windows: UsageWindow[]): UsageWindow[] {
  if (windows.length === 0) throw new Error("Usage response carried no usage windows");
  return windows;
}

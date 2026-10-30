import { isRecord } from "./http";

export interface UsageWindow {
  id: string;
  label: string;
  percent: number;
  resetsAt: string;
}

export const WINDOW_LABELS = { rolling: "5h", weekly: "1w", monthly: "1mo" } as const;

export type WindowID = keyof typeof WINDOW_LABELS;

export function windowLabel(minutes: number): string {
  if (minutes % (7 * 24 * 60) === 0) return `${minutes / (7 * 24 * 60)}w`;
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

export function selectWindow(
  windows: readonly UsageWindow[],
  id: string | undefined,
): UsageWindow {
  return windows.find((window) => window.id === id) ?? windows[0];
}

export function expectUsageRecord(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) throw new Error("usage response was not an object");
  return input;
}

export function expectWindows(windows: UsageWindow[]): UsageWindow[] {
  if (windows.length === 0) throw new Error("usage response carried no usage windows");
  return windows;
}

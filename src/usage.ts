export interface UsageWindow {
  id: string;
  label: string;
  percent: number;
  resetsAt: string;
}

export const USAGE_ERROR_CODES = ["expired", "unavailable", "failed"] as const;

export type UsageErrorCode = (typeof USAGE_ERROR_CODES)[number];

export interface UsageErrorInfo {
  code: UsageErrorCode;
  message: string;
}

export interface ProviderSnapshot {
  providerID: string;
  name: string;
  account?: string;
  fetchedAt: number;
  windows: UsageWindow[];
  error?: UsageErrorInfo;
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

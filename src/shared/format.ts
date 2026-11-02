import type { UsageWindow } from "./usage";

export function clampPercent(percent: number) {
  return Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
}

export function displayPercent(window: UsageWindow | undefined) {
  return window && Math.round(clampPercent(window.percent));
}

export function formatReset(resetsAt: string, now = Date.now()) {
  const target = Date.parse(resetsAt);
  if (!Number.isFinite(target)) return "—";
  const totalSeconds = Math.max(0, Math.floor((target - now) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

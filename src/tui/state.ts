import { messageOf } from "../shared/errors";
import { isRecord } from "../shared/guards";
import type { ProviderSnapshot, UsageWindow } from "../shared/usage";

type Snapshot = {
  providerName: string;
  accountLabel: string;
  windows: UsageWindow[];
  now: number;
};

export type WidgetState =
  | ({ status: "ok" } & Snapshot)
  | { status: "unavailable" }
  | ({ status: "error"; message: string } & Partial<Snapshot>);

export function snapshot(state: WidgetState | null) {
  return state && (state.status === "ok" || state.status === "error") ? state : undefined;
}

export function errorState(
  message: string,
  previous: Partial<Snapshot> | undefined,
  current?: ProviderSnapshot,
): WidgetState {
  return {
    status: "error",
    message,
    providerName: current?.providerName ?? previous?.providerName,
    accountLabel: current?.accountLabel ?? previous?.accountLabel,
    windows: current && current.windows.length > 0 ? current.windows : previous?.windows,
    now: Date.now(),
  };
}

export function widgetState(
  current: ProviderSnapshot,
  previous: Partial<Snapshot> | undefined,
): WidgetState {
  if (current.error) return errorState(current.error.message, previous, current);
  return {
    status: "ok",
    providerName: current.providerName,
    accountLabel: current.accountLabel ?? "",
    windows: current.windows,
    now: Date.now(),
  };
}

export function rpcErrorMessage(error: unknown): string {
  if (isRecord(error)) {
    if (error.type === "rpc.method_not_found" || error.type === "rpc.unavailable") {
      return "Usage server plugin not loaded; add opencode-usage to opencode.json(c)";
    }
  }
  return messageOf(error);
}

export function readSnapshot(output: unknown): ProviderSnapshot | undefined {
  if (!isRecord(output) || !Array.isArray(output.providers)) return undefined;
  const [current] = output.providers;
  if (
    !isRecord(current) ||
    typeof current.providerID !== "string" ||
    typeof current.providerName !== "string" ||
    typeof current.fetchedAt !== "number" ||
    !Array.isArray(current.windows)
  ) {
    return undefined;
  }
  return current as unknown as ProviderSnapshot;
}

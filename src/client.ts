import { withTimeout } from "./timeout";
import type { ProviderSnapshot } from "./usage";

const REQUEST_TIMEOUT_MS = 30_000;
const TIMEOUT_MESSAGE = `Usage request did not respond within ${REQUEST_TIMEOUT_MS}ms`;

export interface UsageEvent {
  providerID: string;
  fetchedAt: number;
  location?: { directory?: string };
}

export interface UsageClientOptions {
  refreshSeconds: number;
  location?: { directory?: string };
  load(providerID: string, signal: AbortSignal): Promise<ProviderSnapshot | undefined>;
  subscribe(listener: (event: UsageEvent) => void): () => void;
  onSnapshot(snapshot: ProviderSnapshot | undefined): void;
  onError(error: unknown): void;
}

export interface UsageClient {
  select(providerID: string | undefined): void;
  refresh(force?: boolean): Promise<void>;
  dispose(): void;
}

export function createUsageClient(options: UsageClientOptions): UsageClient {
  let providerID: string | undefined;
  let lastFetchedAt = -Infinity;
  let pendingFetchedAt = -Infinity;
  let requestID = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: { id: number; promise: Promise<void>; cancel: () => void } | undefined;

  const unsubscribe = options.subscribe(handleEvent);

  function clearTimer() {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  }

  function cancelInFlight() {
    if (!inFlight) return;
    const request = inFlight;
    inFlight = undefined;
    request.cancel();
  }

  function schedule() {
    clearTimer();
    if (disposed || providerID === undefined) return;
    timer = setTimeout(() => {
      void refresh();
    }, options.refreshSeconds * 1000);
  }

  function matchesLocation(event: UsageEvent) {
    const directory = options.location?.directory;
    return directory === undefined || event.location?.directory === directory;
  }

  function handleEvent(event: UsageEvent) {
    if (disposed || event.providerID !== providerID || !matchesLocation(event)) return;
    if (event.fetchedAt <= lastFetchedAt) return;
    if (inFlight) {
      pendingFetchedAt = Math.max(pendingFetchedAt, event.fetchedAt);
      return;
    }
    void refresh();
  }

  function refresh(force = false): Promise<void> {
    if (disposed) return Promise.resolve();
    clearTimer();
    if (providerID === undefined) {
      cancelInFlight();
      options.onSnapshot(undefined);
      return Promise.resolve();
    }
    if (!force && inFlight) return inFlight.promise;
    cancelInFlight();

    const requested = providerID;
    const id = ++requestID;
    const controller = new AbortController();
    if (!force) pendingFetchedAt = -Infinity;

    const request = withTimeout(
      options.load(requested, controller.signal),
      REQUEST_TIMEOUT_MS,
      TIMEOUT_MESSAGE,
      () => controller.abort(),
    );
    const task = request.promise
      .then(
        (snapshot) => {
          if (inFlight?.id !== id || disposed) return;
          if (snapshot) lastFetchedAt = Math.max(lastFetchedAt, snapshot.fetchedAt);
          options.onSnapshot(snapshot);
        },
        (error) => {
          if (inFlight?.id !== id || disposed) return;
          options.onError(error);
        },
      )
      .finally(() => {
        if (inFlight?.id !== id) return;
        inFlight = undefined;
        if (disposed) return;
        if (pendingFetchedAt > lastFetchedAt) {
          void refresh();
        } else {
          schedule();
        }
      });

    inFlight = { id, promise: task, cancel: request.cancel };
    return task;
  }

  function select(next: string | undefined) {
    if (next === providerID) return;
    providerID = next;
    lastFetchedAt = -Infinity;
    cancelInFlight();
    void refresh();
  }

  return {
    select,
    refresh,
    dispose() {
      disposed = true;
      clearTimer();
      cancelInFlight();
      unsubscribe();
    },
  };
}

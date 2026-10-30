const TIMEOUT_MS = 10_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function epochToISO(value: unknown): string {
  const time = toNumber(value);
  if (time === undefined || time <= 0) return "";
  return new Date(time < 1e12 ? time * 1000 : time).toISOString();
}

// AbortSignal.timeout does not reliably fire in the TUI runtime, so settlement
// must not depend on signal dispatch.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`request did not respond within ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function fetchUsageJSON(
  url: string,
  token: string,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const response = await withTimeout(
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "opencode-usage",
        ...headers,
      },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }),
    TIMEOUT_MS,
  );
  if (!response.ok) {
    const detail = await withTimeout(
      response.text().catch(() => ""),
      TIMEOUT_MS,
    );
    throw new Error(
      `usage request failed with HTTP ${response.status}${detail ? `: ${detail.slice(0, 120)}` : ""}`,
    );
  }
  return withTimeout(response.json(), TIMEOUT_MS);
}

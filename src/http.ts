import { UsageError } from "./errors";
import { withTimeout } from "./timeout";

const TIMEOUT_MS = 10_000;
const TIMEOUT_MESSAGE = `Request did not respond within ${TIMEOUT_MS}ms`;

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
    TIMEOUT_MESSAGE,
  ).promise;
  if (!response.ok) {
    const detail = await withTimeout(
      response.text().catch(() => ""),
      TIMEOUT_MS,
      TIMEOUT_MESSAGE,
    ).promise;
    const suffix = detail ? `: ${detail.slice(0, 120)}` : "";
    if (response.status === 401) {
      throw new UsageError(
        "expired",
        `Credentials expired or invalid (HTTP 401)${suffix}`,
      );
    }
    if (response.status === 403) {
      throw new UsageError("unavailable", `Usage access forbidden (HTTP 403)${suffix}`);
    }
    throw new UsageError(
      "failed",
      `Usage request failed with HTTP ${response.status}${suffix}`,
    );
  }
  return withTimeout(response.json(), TIMEOUT_MS, TIMEOUT_MESSAGE).promise;
}

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { UsageError } from "../errors";
import { fetchUsageJSON, isRecord, toNumber } from "../http";
import { WINDOW_LABELS, type UsageWindow, type WindowID } from "../usage";
import { expectUsageRecord, expectWindows } from "./decode";
import type { UsageProvider } from "./types";

const ENDPOINT = "https://api.anthropic.com/api/oauth/usage";
const KEYCHAIN_SERVICE = "Claude Code-credentials";
const KEYCHAIN_TIMEOUT_MS = 5_000;

const execFileAsync = promisify(execFile);

type Login = { token: string; expires?: number };

function readKeychain(): Promise<string | undefined> {
  if (process.platform !== "darwin") return Promise.resolve(undefined);
  return execFileAsync(
    "security",
    ["find-generic-password", "-a", userInfo().username, "-w", "-s", KEYCHAIN_SERVICE],
    { timeout: KEYCHAIN_TIMEOUT_MS },
  ).then(
    ({ stdout }) => stdout,
    () => undefined,
  );
}

// Linux and Windows always use this file; macOS falls back to it when the
// Keychain rejects Claude Code's write.
function readCredentialsFile(): Promise<string | undefined> {
  return readFile(join(homedir(), ".claude", ".credentials.json"), "utf8").catch(
    () => undefined,
  );
}

// The stored JSON also carries other tools' tokens, so parse failures must not
// surface its contents.
function parseLogin(raw: string | undefined): Login | undefined {
  if (!raw) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || !isRecord(parsed.claudeAiOauth)) return undefined;
  const { accessToken, expiresAt } = parsed.claudeAiOauth;
  if (typeof accessToken !== "string" || accessToken === "") return undefined;
  return { token: accessToken, expires: toNumber(expiresAt) };
}

// Claude Code owns this login and refreshes it; refreshing here would rotate
// its refresh token and sign it out.
async function readToken(): Promise<string> {
  const [keychain, file] = await Promise.all([readKeychain(), readCredentialsFile()]);
  const login = parseLogin(keychain) ?? parseLogin(file);
  if (!login) {
    throw new UsageError(
      "unavailable",
      "Claude Code login not found - run `claude auth login`",
    );
  }
  if (login.expires && login.expires < Date.now()) {
    throw new UsageError(
      "expired",
      "Claude Code token expired - send a prompt with a Claude Agent model to refresh it",
    );
  }
  return login.token;
}

function readWindow(value: unknown, id: WindowID): UsageWindow | undefined {
  if (!isRecord(value)) return undefined;
  const percent = toNumber(value.utilization);
  if (percent === undefined) return undefined;
  return {
    id,
    label: WINDOW_LABELS[id],
    percent,
    resetsAt: typeof value.resets_at === "string" ? value.resets_at : "",
  };
}

function decodeUsage(input: unknown): UsageWindow[] {
  const record = expectUsageRecord(input);
  const windows: UsageWindow[] = [];
  const rolling = readWindow(record.five_hour, "rolling");
  if (rolling) windows.push(rolling);
  const weekly = readWindow(record.seven_day, "weekly");
  if (weekly) windows.push(weekly);
  return expectWindows(windows);
}

async function fetchUsage(): Promise<UsageWindow[]> {
  return decodeUsage(
    await fetchUsageJSON(ENDPOINT, await readToken(), {
      "anthropic-beta": "oauth-2025-04-20",
    }),
  );
}

export const claudeAgent: UsageProvider = {
  id: "claude-agent",
  accepts: (credential) => credential.kind === "external",
  fetch: fetchUsage,
};

import { isRecord } from "./guards";
import type { UsageErrorCode } from "./usage";

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return String(error);
}

export class UsageError extends Error {
  readonly code: UsageErrorCode;
  readonly accountLabel?: string;

  constructor(code: UsageErrorCode, message: string, accountLabel?: string) {
    super(message);
    this.name = "UsageError";
    this.code = code;
    this.accountLabel = accountLabel;
  }
}

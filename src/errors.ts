import type { UsageErrorCode } from "./usage";

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
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

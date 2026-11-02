import { describe, expect, test } from "bun:test";
import { accountKeyOf } from "../src/providers/account-key";
import { credential } from "./fixtures";

describe("accountKeyOf", () => {
  test("derives OpenAI account keys from metadata.accountID", () => {
    expect(
      accountKeyOf("openai", credential({ metadata: { accountID: "acct_123" } })),
    ).toBe("openai:account:acct_123");
  });

  test("returns null for missing or invalid OpenAI metadata", () => {
    expect(accountKeyOf("openai", credential())).toBeNull();
    expect(
      accountKeyOf("openai", credential({ metadata: { accountID: "" } })),
    ).toBeNull();
    expect(
      accountKeyOf("openai", credential({ metadata: { accountID: 123 } })),
    ).toBeNull();
  });

  test("derives OpenCode organization keys for Console OAuth", () => {
    expect(
      accountKeyOf(
        "opencode-go",
        credential({ kind: "oauth", metadata: { orgID: "org_123" } }),
      ),
    ).toBe("opencode:organization:org_123");
  });

  test("returns null for non-OAuth OpenCode credentials and missing metadata", () => {
    expect(
      accountKeyOf(
        "opencode-go",
        credential({ kind: "key", metadata: { orgID: "org_123" } }),
      ),
    ).toBeNull();
    expect(accountKeyOf("opencode-go", credential({ kind: "oauth" }))).toBeNull();
  });

  test("returns null for providers without a merge key", () => {
    for (const id of [
      "claude-agent",
      "kimi-code-plan-cn",
      "kimi-code-plan-global",
      "zai-coding-plan",
      "zhipuai-coding-plan",
    ]) {
      expect(
        accountKeyOf(
          id,
          credential({ metadata: { accountID: "acct_123", orgID: "org_123" } }),
        ),
      ).toBeNull();
    }
  });
});

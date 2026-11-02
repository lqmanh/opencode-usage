import { describe, expect, test } from "bun:test";
import { claudeAgent } from "../../src/server/providers/claude-agent";
import { kimiCn, kimiGlobal } from "../../src/server/providers/kimi";
import { openai } from "../../src/server/providers/openai";
import { opencodeGo } from "../../src/server/providers/opencode-go";
import type { UsageProvider } from "../../src/server/providers/types";
import { zaiCodingPlan, zhipuaiCodingPlan } from "../../src/server/providers/zai";
import { credential } from "./fixtures";

describe("provider account keys", () => {
  test("derives OpenAI account keys from metadata.accountID", () => {
    expect(openai.accountKey?.(credential({ metadata: { accountID: "acct_123" } }))).toBe(
      "openai:account:acct_123",
    );
  });

  test("returns null for missing or invalid OpenAI metadata", () => {
    expect(openai.accountKey?.(credential())).toBeNull();
    expect(openai.accountKey?.(credential({ metadata: { accountID: "" } }))).toBeNull();
    expect(openai.accountKey?.(credential({ metadata: { accountID: 123 } }))).toBeNull();
  });

  test("derives OpenCode organization keys for Console OAuth", () => {
    expect(
      opencodeGo.accountKey?.(
        credential({ kind: "oauth", metadata: { orgID: "org_123" } }),
      ),
    ).toBe("opencode:organization:org_123");
  });

  test("returns null for non-OAuth OpenCode credentials and missing metadata", () => {
    expect(
      opencodeGo.accountKey?.(
        credential({ kind: "key", metadata: { orgID: "org_123" } }),
      ),
    ).toBeNull();
    expect(opencodeGo.accountKey?.(credential({ kind: "oauth" }))).toBeNull();
  });

  test("providers without a merge key do not implement accountKey", () => {
    for (const provider of [
      claudeAgent,
      kimiCn,
      kimiGlobal,
      zaiCodingPlan,
      zhipuaiCodingPlan,
    ] as UsageProvider[]) {
      expect(provider.accountKey).toBeUndefined();
    }
  });
});

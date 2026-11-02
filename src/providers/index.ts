import { claudeAgent } from "./claude-agent";
import { kimiCn, kimiGlobal } from "./kimi";
import { openai } from "./openai";
import { opencodeGo } from "./opencode-go";
import type { UsageProvider } from "./types";
import { zaiCodingPlan, zhipuaiCodingPlan } from "./zai";

const PROVIDERS: readonly UsageProvider[] = [
  opencodeGo,
  openai,
  claudeAgent,
  kimiCn,
  kimiGlobal,
  zaiCodingPlan,
  zhipuaiCodingPlan,
];

export function findProvider(providerID: string | undefined): UsageProvider | undefined {
  if (!providerID) return undefined;
  return PROVIDERS.find((provider) => provider.id === providerID);
}

import type { UsageWindow } from "../usage";

export type Credential = {
  integrationID: string;
  kind: "key" | "oauth" | "external";
  token: string;
  label: string;
  expires?: number;
  metadata: Record<string, unknown>;
};

export interface UsageProvider {
  id: string;
  integrations: readonly string[];
  accepts(credential: Credential): boolean;
  fetch(credential: Credential): Promise<UsageWindow[]>;
}

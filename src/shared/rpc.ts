import { Rpc } from "@opencode/plugin/rpc";
import { USAGE_ERROR_CODES } from "./usage";

export const USAGE_INVALIDATION_EVENTS = [
  "credential.updated",
  "credential.switched",
  "integration.updated",
] as const;

const WINDOW_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    percent: { type: "number" },
    resetsAt: { type: "string" },
  },
  required: ["id", "label", "percent", "resetsAt"],
  additionalProperties: false,
} as const;

const ERROR_SCHEMA = {
  type: "object",
  properties: {
    code: { enum: USAGE_ERROR_CODES },
    message: { type: "string" },
  },
  required: ["code", "message"],
  additionalProperties: false,
} as const;

const ACCOUNT_KEY_SCHEMA = {
  anyOf: [{ type: "string" }, { type: "null" }],
} as const;

const LISTING_PROPERTIES = {
  providerID: { type: "string" },
  providerName: { type: "string" },
  accountLabel: { type: "string" },
  accountKey: ACCOUNT_KEY_SCHEMA,
} as const;

const LISTING_REQUIRED = ["providerID", "providerName", "accountKey"] as const;

const LIST_PROVIDER_SCHEMA = {
  type: "object",
  properties: LISTING_PROPERTIES,
  required: LISTING_REQUIRED,
  additionalProperties: false,
} as const;

const LIST_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    providers: { type: "array", items: LIST_PROVIDER_SCHEMA },
  },
  required: ["providers"],
  additionalProperties: false,
} as const;

const SNAPSHOT_SCHEMA = {
  type: "object",
  properties: {
    ...LISTING_PROPERTIES,
    fetchedAt: { type: "number" },
    windows: { type: "array", items: WINDOW_SCHEMA },
    error: ERROR_SCHEMA,
  },
  required: [...LISTING_REQUIRED, "fetchedAt", "windows"] as const,
  additionalProperties: false,
} as const;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    providers: { type: "array", items: SNAPSHOT_SCHEMA },
  },
  required: ["providers"],
  additionalProperties: false,
} as const;

export const usageRpc = Rpc.define({
  id: "opencode-usage",
  methods: {
    list: {
      input: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      output: LIST_OUTPUT_SCHEMA,
      errors: {
        internal: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
    get: {
      input: {
        type: "object",
        properties: {
          providerID: { type: "string", minLength: 1 },
          bypassCache: { type: "boolean" },
        },
        additionalProperties: false,
      },
      output: OUTPUT_SCHEMA,
      errors: {
        internal: {
          type: "object",
          properties: {
            providerID: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    },
  },
  events: {
    updated: {
      schema: {
        type: "object",
        properties: {
          providerID: { type: "string" },
          fetchedAt: { type: "number" },
        },
        required: ["providerID", "fetchedAt"],
        additionalProperties: false,
      },
    },
  },
});

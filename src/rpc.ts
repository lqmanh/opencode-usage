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

const SNAPSHOT_SCHEMA = {
  type: "object",
  properties: {
    providerID: { type: "string" },
    name: { type: "string" },
    account: { type: "string" },
    fetchedAt: { type: "number" },
    windows: { type: "array", items: WINDOW_SCHEMA },
    error: ERROR_SCHEMA,
  },
  required: ["providerID", "name", "fetchedAt", "windows"],
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
    get: {
      input: {
        type: "object",
        properties: {
          providerID: { type: "string", minLength: 1 },
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

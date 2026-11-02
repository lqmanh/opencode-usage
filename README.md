# opencode-usage

OpenCode v2 plugin for model provider quota/usage. It has two parts:

- **Server plugin** — resolves credentials, fetches usage, caches it, and exposes it through OpenCode's plugin RPC.
- **TUI plugin** — an RPC client that renders TUI-specific surfaces. It never reads credentials or calls provider endpoints.

The RPC is the shared contract. The TUI is one client; a GUI plugin or third-party client can render the same data with its own surfaces.

```text
TUI ─┐
GUI ─┼─ RPC get / updated ──> server plugin ──> providers
... ─┘
```

## Supported providers

- [OpenCode Go](https://opencode.ai/go)
- [Kimi for Coding CN](https://www.kimi.com/code) and [Kimi for Coding Global](https://www.kimi.ai/code)
- [Z.AI Coding Plan](https://z.ai/subscribe) and [Zhipu AI Coding Plan](https://www.bigmodel.cn/glm-coding)
- [ChatGPT Go/Plus/Pro](https://chatgpt.com/pricing)
- [Claude Agent](https://opencode.ai/v2/docs/providers#claude-agent) with a [Claude](https://claude.com/pricing) subscription

## Installation

Add the package to `opencode.json(c)`:

```json
{
  "plugins": ["github:lqmanh/opencode-usage"]
}
```

OpenCode loads both parts from this entry; the CLI loads the TUI part automatically. `cli.json` is for CLI-only plugins, so this package does not need an entry there.

### Remote server

Configure the package in the remote server's `opencode.json(c)`. The TUI part is loaded from that server's plugin list.

## TUI usage

Sidebar widget:

```text
OpenCode Go                          Default
5h  42% ████████████░░░░░░░░░░░░░░░░   3h 6m
1w  18% █████░░░░░░░░░░░░░░░░░░░░░░░  2d 11h
1mo  7% ██░░░░░░░░░░░░░░░░░░░░░░░░░░     20d
```

Compact indicator above the prompt:

```text
OpenCode Go               ◈ ◇ ◇ 5h ·   3h 6m
```

The glyphs stand for the provider's quota windows in order. Each fills up as usage rises: `◇` below 70%, `◈` from 70%, `◆` from 90%. The window the countdown tracks is colored by the same levels: green, amber, red, while the others stay muted.

<!-- prettier-ignore -->
> [!TIP]
> Click the name to toggle between the provider name and the active account. Click the glyphs, label, or countdown to cycle the window it tracks.

### Options

| Option           | Default | Description                           |
| ---------------- | ------- | ------------------------------------- |
| `refreshSeconds` | `300`   | Poll interval in seconds, minimum 30. |

`refreshSeconds` is the TUI polling interval. Configure it in the same plugin entry:

```json
{
  "plugins": [
    {
      "package": "github:lqmanh/opencode-usage",
      "options": {
        "refreshSeconds": 120
      }
    }
  ]
}
```

Other clients manage their own polling; the server never polls. The TUI also refreshes when new usage is available and when the active account changes. It has no manual refresh action.

## RPC

The server exposes `list` and `get` on the `opencode-usage` RPC.

### list

Returns configured supported providers whose credentials resolve. It never fetches usage.

Input:

```json
{}
```

Output:

```json
{
  "providers": [
    {
      "providerID": "opencode-go",
      "providerName": "OpenCode Go",
      "accountLabel": "Default",
      "accountKey": "opencode:organization:org_..."
    }
  ]
}
```

Unconfigured and unsupported providers are omitted. `providerID` is OpenCode's provider ID (`ProviderInfo.id`).

### get

Input:

```json
{
  "providerID": "opencode-go",
  "bypassCache": true
}
```

`providerID` is optional. With it, `providers` contains zero or one snapshot. Without it, `providers` contains every configured supported provider with an active credential. `bypassCache` is optional; `true` skips the 60-second cache, fetches fresh, updates the cache, and emits `updated`. `false` or omitted uses the cache.

Output:

```json
{
  "providers": [
    {
      "providerID": "opencode-go",
      "providerName": "OpenCode Go",
      "accountLabel": "Default",
      "accountKey": "opencode:organization:org_...",
      "fetchedAt": 1762041600000,
      "windows": [
        {
          "id": "rolling",
          "label": "5h",
          "percent": 42,
          "resetsAt": "2026-11-02T12:00:00.000Z"
        }
      ]
    }
  ]
}
```

- `fetchedAt` is the snapshot version in Unix milliseconds.
- `resetsAt` is ISO 8601 and may be empty.
- `providerName` is the provider display name.
- `accountLabel` is the active connection's label or environment variable name.
- `accountKey` is `openai:account:<id>` for OpenAI, `opencode:organization:<id>` for OpenCode Go Console OAuth, and `null` otherwise. It is used to merge accounts across hosts.

Provider failures use the same snapshot with `windows: []` and an `error` containing a `code` and `message`:

| Error code | Meaning |
| --- | --- |
| `expired` | The active credential is expired, was rejected, or could not be resolved. |
| `unavailable` | An active credential exists but cannot be used to read usage. |
| `failed` | The provider request, timeout, or response decoding failed. |

Results are cached for 60 seconds. After a fresh fetch, the server emits `rpc.opencode-usage.updated` with `{ providerID, fetchedAt }`. Clients can refresh on that event or poll; ignore events that are not newer than the displayed snapshot. Usage follows the account currently active in OpenCode.

### Building a client

A client only needs the server part.

1. Call `list({})` to discover configured providers, `get({ providerID })` for the provider the user is looking at, or `get({})` for all providers.
2. Render `providerName`, `accountLabel`, and `windows` using the client's own surfaces.
3. Handle `error` entries per provider. An empty `providers` array means unconfigured or unsupported.
4. Subscribe to `rpc.opencode-usage.updated` if the client has an event stream. Otherwise poll.
5. Use `fetchedAt` to ignore stale events and avoid unnecessary refetches.

Example:

```ts
const result = await api.rpc.call({
  rpcID: "opencode-usage",
  method: "get",
  input: { providerID },
  location: { directory: cwd },
});
const windows = (result.output?.providers[0]?.windows ?? []).map(
  ({ label, percent, resetsAt }) => ({
    label,
    usedPercent: percent,
    resetsAt,
  }),
);
```

## Good to know

- Usage is collected on the OpenCode server host. With a remote server, credentials and the Claude Code login for Claude Agent must exist there.
- The RPC requires the server part; the TUI cannot collect usage alone.

## Development

```sh
bun install
bun run check
```

### Project layout

- `src/shared` — RPC contract, usage types, shared errors, the UI-agnostic usage client, and formatting helpers shared by TUI and future GUI clients.
- `src/server` — server plugin entry.
- `src/tui` — TUI plugin entry.

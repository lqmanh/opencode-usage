/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import type { ResolvedTheme } from "@opencode/theme/tui";
import type { JSX } from "@opentui/solid";
import { createEffect, createRoot, on, untrack } from "solid-js";
import { createUsageClient } from "./client";
import { clampPercent, displayPercent, formatReset } from "./format";
import { messageOf } from "./errors";
import { isRecord } from "./http";
import { USAGE_INVALIDATION_EVENTS, usageRpc } from "./rpc";
import { selectWindow, type ProviderSnapshot, type UsageWindow } from "./usage";

const LEVEL_COLORS = ["success", "warning", "error"] as const;
const LEVEL_GLYPHS = ["◇", "◈", "◆"];

type Snapshot = {
  name: string;
  account: string;
  windows: UsageWindow[];
  now: number;
};

type WidgetState =
  | ({ status: "ok" } & Snapshot)
  | { status: "unavailable" }
  | ({ status: "error"; message: string } & Partial<Snapshot>);

function level(percent: number | undefined): 0 | 1 | 2 {
  if (percent === undefined) return 0;
  if (percent >= 90) return 2;
  if (percent >= 70) return 1;
  return 0;
}

function levelColor(theme: ResolvedTheme, percent: number | undefined) {
  if (percent === undefined) return theme.text.muted;
  return theme.text.feedback[LEVEL_COLORS[level(percent)]].base;
}

function snapshot(state: WidgetState | null) {
  return state && (state.status === "ok" || state.status === "error") ? state : undefined;
}

function errorState(
  message: string,
  previous: Partial<Snapshot> | undefined,
  current?: ProviderSnapshot,
): WidgetState {
  return {
    status: "error",
    message,
    name: current?.name ?? previous?.name,
    account: current?.account ?? previous?.account,
    windows: current && current.windows.length > 0 ? current.windows : previous?.windows,
    now: Date.now(),
  };
}

function widgetState(
  current: ProviderSnapshot,
  previous: Partial<Snapshot> | undefined,
): WidgetState {
  if (current.error) return errorState(current.error.message, previous, current);
  return {
    status: "ok",
    name: current.name,
    account: current.account ?? "",
    windows: current.windows,
    now: Date.now(),
  };
}

function rpcErrorMessage(error: unknown): string {
  if (isRecord(error)) {
    if (error.type === "rpc.method_not_found" || error.type === "rpc.unavailable") {
      return "Usage server plugin not loaded; add opencode-usage to opencode.json(c)";
    }
  }
  return messageOf(error);
}

function readSnapshot(output: unknown): ProviderSnapshot | undefined {
  if (!isRecord(output) || !Array.isArray(output.providers)) return undefined;
  const [current] = output.providers;
  if (
    !isRecord(current) ||
    typeof current.providerID !== "string" ||
    typeof current.name !== "string" ||
    typeof current.fetchedAt !== "number" ||
    !Array.isArray(current.windows)
  ) {
    return undefined;
  }
  return current as unknown as ProviderSnapshot;
}

function ResetTime(props: {
  reset: string | undefined;
  theme: ResolvedTheme;
  error?: boolean;
}) {
  return (
    <box width={7} flexShrink={0} flexDirection="row" justifyContent="flex-end">
      <text
        fg={props.error ? props.theme.text.feedback.error.base : props.theme.text.muted}
      >
        {props.reset}
      </text>
    </box>
  );
}

function WindowRow(props: {
  label: string;
  labelWidth: number;
  window: UsageWindow | undefined;
  now: number | undefined;
  theme: ResolvedTheme;
}) {
  const percent = displayPercent(props.window);
  const color = levelColor(props.theme, percent);
  const track = props.window && props.theme.background.raised.high;
  return (
    <box flexDirection="row" gap={1}>
      <text fg={props.theme.text.base} width={props.labelWidth} flexShrink={0}>
        {props.label}
      </text>
      <box
        width={percent === 100 ? 4 : 3}
        flexShrink={0}
        flexDirection="row"
        justifyContent="flex-end"
      >
        <text fg={color}>{percent === undefined ? "—" : `${percent}%`}</text>
      </box>
      <box
        flexGrow={1}
        height={1}
        backgroundColor={track}
        renderAfter={function (buffer) {
          if (!props.window) return;
          const cells = Math.round(
            (clampPercent(props.window.percent) / 100) * this.width,
          );
          if (cells < 1) return;
          buffer.fillRect(this.screenX, this.screenY, cells, 1, color);
        }}
      />
      <ResetTime
        reset={props.window && formatReset(props.window.resetsAt, props.now)}
        theme={props.theme}
      />
    </box>
  );
}

function UsageWidget(props: { state: WidgetState; theme: ResolvedTheme }) {
  const current = snapshot(props.state);
  const statusLine = props.state.status === "error" ? props.state.message : "";
  const statusColor =
    props.state.status === "error"
      ? props.theme.text.feedback.error.base
      : props.theme.text.muted;
  const windows = current?.windows ?? [];
  const labelWidth = windows.reduce(
    (width, window) => Math.max(width, window.label.length),
    0,
  );
  return (
    <box flexDirection="column">
      {current?.name ? (
        <box flexDirection="row" gap={1}>
          <text fg={props.theme.text.base} flexShrink={0}>
            <b>{current.name}</b>
          </text>
          {current.account ? (
            <text
              fg={props.theme.text.muted}
              flexGrow={1}
              minWidth={0}
              truncate
              wrapMode="none"
              textAlign="right"
            >
              {current.account}
            </text>
          ) : null}
        </box>
      ) : null}
      {windows.map((window) => (
        <WindowRow
          label={window.label}
          labelWidth={labelWidth}
          window={window}
          now={current?.now}
          theme={props.theme}
        />
      ))}
      {statusLine ? (
        <text fg={statusColor} wrapMode="word">
          {statusLine}
        </text>
      ) : null}
    </box>
  );
}

function clickHandlers(onClick: () => void) {
  let dragged = false;
  return {
    onMouseDown: () => {
      dragged = false;
    },
    onMouseDrag: () => {
      dragged = true;
    },
    onMouseUp: (event: { button: number }) => {
      if (event.button === 0 && !dragged) onClick();
    },
  };
}

function CompactUsage(props: {
  state: WidgetState;
  theme: ResolvedTheme;
  showAccount: boolean;
  countdown: string | undefined;
  onToggle: () => void;
  onCycle: () => void;
}) {
  const current = snapshot(props.state);
  const windows = current?.windows ?? [];
  if (windows.length === 0) return null;
  const name = props.showAccount && current?.account ? current.account : current?.name;
  const selected = selectWindow(windows, props.countdown);
  const reset = formatReset(selected.resetsAt, current?.now);
  const error = props.state.status === "error";
  const labelWidth = windows.reduce(
    (width, window) => Math.max(width, window.label.length),
    0,
  );
  return (
    <box flexDirection="row" gap={1} justifyContent="space-between">
      <text
        fg={props.theme.text.muted}
        wrapMode="none"
        truncate
        flexShrink={1}
        minWidth={0}
        {...clickHandlers(props.onToggle)}
      >
        {name}
      </text>
      <box flexDirection="row" gap={1} flexShrink={0} {...clickHandlers(props.onCycle)}>
        <text>
          {windows.map((window, index) => {
            const percent = displayPercent(window);
            const glyph = LEVEL_GLYPHS[level(percent)];
            const fg =
              window.id === selected.id
                ? levelColor(props.theme, percent)
                : props.theme.text.muted;
            return <span style={{ fg }}>{index > 0 ? ` ${glyph}` : glyph}</span>;
          })}
        </text>
        <text fg={props.theme.text.muted} width={labelWidth} flexShrink={0}>
          {selected.label}
        </text>
        <text fg={props.theme.text.muted}>·</text>
        <ResetTime reset={reset} theme={props.theme} error={error} />
      </box>
    </box>
  );
}

export default Plugin.define({
  id: "opencode-usage",
  setup(context) {
    const options = (context.options ?? {}) as Record<string, unknown>;
    const refreshSeconds =
      typeof options.refreshSeconds === "number" && options.refreshSeconds >= 30
        ? options.refreshSeconds
        : 300;

    // Workaround for anomalyco/opencode#39986: the host only repaints a
    // plugin's initial frame, so widgets stay stateless and claims remount on
    // every change. A remount alone no longer schedules a frame, so each one
    // also requests a render. Drop the stateless remounting and the
    // requestRender calls once the host shares its Solid runtime with plugins.
    let last: WidgetState | null = null;
    let showAccount = false;
    let countdown: string | undefined;
    let disposeSidebar: (() => void) | undefined;
    let disposeCompact: (() => void) | undefined;

    // ui.model.current() reflects the picker's draft selection; the session's
    // stored model only updates on submit.
    function selectedProviderID() {
      return context.ui.model.current()?.providerID;
    }

    function claimSlot(
      append: "sidebar.content" | "session.composer.top",
      render: (state: WidgetState, theme: ResolvedTheme) => JSX.Element,
    ) {
      if (!last || last.status === "unavailable") return undefined;
      const state = last;
      const theme = context.theme;
      return context.ui.slot({ append, render: () => render(state, theme) });
    }

    function renderSidebar() {
      disposeSidebar?.();
      disposeSidebar = claimSlot("sidebar.content", (state, theme) => (
        <UsageWidget state={state} theme={theme} />
      ));
      context.renderer.requestRender();
    }

    function renderCompact() {
      disposeCompact?.();
      disposeCompact = claimSlot("session.composer.top", (state, theme) =>
        selectedProviderID() ? (
          <CompactUsage
            state={state}
            theme={theme}
            showAccount={showAccount}
            countdown={countdown}
            onToggle={toggleAccount}
            onCycle={cycleCountdown}
          />
        ) : null,
      );
      context.renderer.requestRender();
    }

    function toggleAccount() {
      if (!snapshot(last)?.account) return;
      showAccount = !showAccount;
      queueMicrotask(() => renderCompact());
    }

    function cycleCountdown() {
      const windows = snapshot(last)?.windows;
      if (!windows || windows.length === 0) return;
      const selected = selectWindow(windows, countdown);
      countdown = windows[(windows.indexOf(selected) + 1) % windows.length].id;
      queueMicrotask(() => renderCompact());
    }

    function renderAll() {
      renderSidebar();
      renderCompact();
    }

    const rpc = context.client.rpc(usageRpc);
    const client = createUsageClient({
      refreshSeconds,
      location: context.location,
      load: async (providerID, signal) => {
        const output = await rpc.get(
          { providerID },
          {
            ...(context.location ? { location: context.location } : {}),
            signal,
          },
        );
        return readSnapshot(output);
      },
      subscribe: (listener) =>
        rpc.events.on("updated", (event) => {
          const providerID = event.data.providerID;
          const fetchedAt = event.data.fetchedAt;
          if (typeof providerID !== "string" || typeof fetchedAt !== "number") return;
          listener({ providerID, fetchedAt, location: event.location });
        }),
      onSnapshot: (current) => {
        last = current ? widgetState(current, snapshot(last)) : { status: "unavailable" };
        renderAll();
      },
      onError: (error) => {
        last = errorState(rpcErrorMessage(error), snapshot(last));
        renderAll();
      },
    });

    client.select(selectedProviderID());

    const stopRefreshEvents = USAGE_INVALIDATION_EVENTS.map((type) =>
      context.data.on(type, () => {
        void client.refresh(true);
      }),
    );

    // Watch theme and model selection; a remount is the only way to repaint.
    const disposeWatch = createRoot((dispose) => {
      createEffect(
        on(
          () => context.theme,
          (theme, previous) => {
            if (theme === previous) return;
            untrack(() => renderAll());
          },
          { defer: true },
        ),
      );
      createEffect(
        on(
          () => context.ui.model.current()?.providerID,
          (providerID, previous) => {
            if (providerID === previous) return;
            untrack(() => client.select(providerID));
          },
          { defer: true },
        ),
      );
      return dispose;
    });

    return () => {
      for (const stop of stopRefreshEvents) stop();
      disposeWatch();
      client.dispose();
      disposeSidebar?.();
      disposeCompact?.();
    };
  },
});

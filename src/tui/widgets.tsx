/** @jsxImportSource @opentui/solid */
import type { ResolvedTheme } from "@opencode/theme/tui";
import { clampPercent, displayPercent, formatReset } from "../shared/format";
import { selectWindow, type UsageWindow } from "../shared/usage";
import { snapshot, type WidgetState } from "./state";

const LEVEL_COLORS = ["success", "warning", "error"] as const;
const LEVEL_GLYPHS = ["◇", "◈", "◆"];

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

function labelWidth(windows: readonly UsageWindow[]): number {
  return windows.reduce((width, window) => Math.max(width, window.label.length), 0);
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

export function UsageWidget(props: { state: WidgetState; theme: ResolvedTheme }) {
  const current = snapshot(props.state);
  const statusLine = props.state.status === "error" ? props.state.message : "";
  const statusColor =
    props.state.status === "error"
      ? props.theme.text.feedback.error.base
      : props.theme.text.muted;
  const windows = current?.windows ?? [];
  const width = labelWidth(windows);
  return (
    <box flexDirection="column">
      {current?.providerName ? (
        <box flexDirection="row" gap={1}>
          <text fg={props.theme.text.base} flexShrink={0}>
            <b>{current.providerName}</b>
          </text>
          {current.accountLabel ? (
            <text
              fg={props.theme.text.muted}
              flexGrow={1}
              minWidth={0}
              truncate
              wrapMode="none"
              textAlign="right"
            >
              {current.accountLabel}
            </text>
          ) : null}
        </box>
      ) : null}
      {windows.map((window) => (
        <WindowRow
          label={window.label}
          labelWidth={width}
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

export function CompactUsage(props: {
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
  const name =
    props.showAccount && current?.accountLabel
      ? current.accountLabel
      : current?.providerName;
  const selected = selectWindow(windows, props.countdown);
  const reset = formatReset(selected.resetsAt, current?.now);
  const error = props.state.status === "error";
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
        <text fg={props.theme.text.muted} width={labelWidth(windows)} flexShrink={0}>
          {selected.label}
        </text>
        <text fg={props.theme.text.muted}>·</text>
        <ResetTime reset={reset} theme={props.theme} error={error} />
      </box>
    </box>
  );
}

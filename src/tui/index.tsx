/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode/plugin/tui";
import type { ResolvedTheme } from "@opencode/theme/tui";
import type { JSX } from "@opentui/solid";
import { createEffect, createRoot, on, untrack } from "solid-js";
import { createUsageClient } from "../shared/usage-client";
import { USAGE_INVALIDATION_EVENTS, usageRpc } from "../shared/rpc";
import { selectWindow } from "../shared/usage";
import {
  errorState,
  readSnapshot,
  rpcErrorMessage,
  snapshot,
  widgetState,
  type WidgetState,
} from "./state";
import { CompactUsage, UsageWidget } from "./widgets";

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
      if (!snapshot(last)?.accountLabel) return;
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

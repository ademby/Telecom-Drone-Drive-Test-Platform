import type { HeatmapOperationsViewCallbacks } from "./HeatmapOperationsView.js";
import type { HeatmapWorkflow } from "./HeatmapWorkflow.js";
import type { SignalQualityPalette } from "./SignalQualityPalette.js";

/** Minimal surface needed to sync toggle state after heatmapWorkflow.toggle(). */
export interface HeatmapToggleStateTarget {
  setSignalQualityToggleState(visible: boolean): void;
}

export interface HeatmapOperationsCallbacksDeps {
  heatmapWorkflow: HeatmapWorkflow;
  /**
   * Deferred getter: OperationsPanel is constructed after the callbacks object.
   * Callers must only invoke handlers after init.
   */
  getOperationsPanel: () => HeatmapToggleStateTarget;
}

/**
 * Builds HeatmapOperationsViewCallbacks by wiring UI events to HeatmapWorkflow.
 * Lives with the heatmap workflow so CompositionRoot only injects deps.
 */
export function createHeatmapOperationsCallbacks(
  deps: HeatmapOperationsCallbacksDeps,
): HeatmapOperationsViewCallbacks {
  const { heatmapWorkflow, getOperationsPanel } = deps;

  return {
    onToggle: () =>
      void heatmapWorkflow.toggle().then((visible) =>
        getOperationsPanel().setSignalQualityToggleState(visible),
      ),
    onRefresh: () => void heatmapWorkflow.refresh(),
    onPaletteChange: (palette: SignalQualityPalette) => {
      try {
        heatmapWorkflow.setPalette(palette);
      } catch {
        /* ignore transient invalid state */
      }
    },
    onPaletteReset: () => heatmapWorkflow.resetPalette(),
  };
}

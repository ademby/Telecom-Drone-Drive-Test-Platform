import type { SignalQualityApi } from "@drone-drive/contracts/signal-quality";
import { MapController } from "../../map/MapController.js";
import HttpSignalQualityApi from "./HttpSignalQualityApi.js";
import SignalQualityLegend from "./SignalQualityLegend.js";
import {
  DEFAULT_SIGNAL_QUALITY_PALETTE,
  isValidPalette,
  type SignalQualityPalette,
} from "./SignalQualityPalette.js";
import {
  HttpSignalQualityRenderer,
  type SignalQualityRenderer,
} from "./SignalQualityRenderer.js";

export interface HeatmapLegend {
  readonly element: HTMLElement;
  setRange(min: number, max: number): void;
  setPalette(palette: SignalQualityPalette): void;
}

export interface HeatmapWorkflowOptions {
  readonly mapController: MapController;
  readonly legend?: HeatmapLegend;
  /** Defaults to `DEFAULT_SIGNAL_QUALITY_PALETTE` when omitted. */
  readonly initialPalette?: SignalQualityPalette;
}

/**
 * Operator-facing Signal Quality exploration: visibility, palette, when to load/refresh range.
 * Owns attaching renderer.layer and legend control to the map (ADR-0005 / R-07).
 * Does not fetch tiles; does not listen to MissionWorkflow.
 */
export class HeatmapWorkflow {
  private readonly signalQualityApi: SignalQualityApi;
  private readonly renderer: SignalQualityRenderer;
  private readonly legend: HeatmapLegend;
  private dataLoaded = false;
  private visible = false;
  private palette: SignalQualityPalette;

  constructor(options: HeatmapWorkflowOptions) {
    this.legend = options.legend ?? new SignalQualityLegend();
    this.palette = options.initialPalette ?? DEFAULT_SIGNAL_QUALITY_PALETTE;

    this.signalQualityApi = new HttpSignalQualityApi();
    this.renderer = new HttpSignalQualityRenderer(this.signalQualityApi);

    this.renderer.setPalette(this.palette);
    this.legend.setPalette(this.palette);

    options.mapController.map.addLayer(this.renderer.layer);
    if (this.legend instanceof SignalQualityLegend) {
      options.mapController.map.addControl(this.legend);
    }
  }

  getPalette(): SignalQualityPalette {
    return this.palette;
  }

  setPalette(palette: SignalQualityPalette): void {
    if (!isValidPalette(palette)) {
      throw new Error(
        "Signal Quality palette must have at least two stops spanning 0..1 with valid hex colors.",
      );
    }
    this.palette = palette;
    this.renderer.setPalette(palette);
    this.legend.setPalette(palette);
  }

  resetPalette(): void {
    this.setPalette(DEFAULT_SIGNAL_QUALITY_PALETTE);
  }

  async load(): Promise<void> {
    const range = await this.signalQualityApi.getRange();
    this.renderer.setRange(range.min, range.max, range.version);
    this.legend.setRange(range.min, range.max);
    this.dataLoaded = true;
    this.visible = false;
    this.renderer.setVisible(false);
    this.legend.element.style.display = "none";
  }

  /**
   * Re-fetches range/version and applies to renderer without changing visibility.
   * Advancing version changes the tile source cache key so tiles re-request.
   */
  async refresh(): Promise<void> {
    if (!this.dataLoaded) return;
    const range = await this.signalQualityApi.getRange();
    this.renderer.setRange(range.min, range.max, range.version);
    this.legend.setRange(range.min, range.max);
  }

  isVisible(): boolean {
    return this.visible;
  }

  async toggle(): Promise<boolean> {
    if (this.visible) {
      this.visible = false;
      this.renderer.setVisible(false);
      this.legend.element.style.display = "none";
      return this.visible;
    }
    if (!this.dataLoaded) await this.load();
    this.visible = true;
    this.renderer.setVisible(true);
    this.legend.element.style.display = "block";
    return this.visible;
  }
}

export default HeatmapWorkflow;

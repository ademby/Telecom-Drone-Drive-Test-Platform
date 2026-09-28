import type { PanelView } from "../../ui/PanelView.js";
import {
  heatmapNavCardTemplate,
  heatmapSectionTemplate,
  paletteStopRowTemplate,
} from "./HeatmapOperationsViewTemplate.js";
import HeatmapWorkflow from "./HeatmapWorkflow.js";
import type { SignalQualityPalette } from "./SignalQualityPalette.js";

export class HeatmapOperationsView {
  /** Bundles this view's `.panel-view` section and its home-screen `.panel-group` nav
   *  card so `OperationsPanel.registerView` can insert both without knowing this
   *  workflow's markup. See docs/adr/0005-workflow-owned-map-surface-and-ui.md. */
  readonly panelView: PanelView;
  readonly element: HTMLElement;
  private readonly stopsContainer: HTMLElement;
  private readonly toggleButton: HTMLButtonElement;

  constructor(readonly heatmapWorkflow: HeatmapWorkflow) {
    const navCardElement = document.createElement("div");
    navCardElement.className = "panel-group";
    navCardElement.innerHTML = heatmapNavCardTemplate;

    const sectionElement = document.createElement("section");
    sectionElement.className = "panel-view panel-heatmap hidden";
    sectionElement.innerHTML = heatmapSectionTemplate;

    this.element = sectionElement;
    this.panelView = {
      id: "heatmap",
      title: "Signal quality",
      sectionElement,
      navCardElement,
    };

    this.toggleButton = sectionElement.querySelector(
      ".toggle-kpi",
    ) as HTMLButtonElement;
    this.toggleButton?.addEventListener("click", () =>
      this.heatmapWorkflow.toggle(),
    );
    // Tiles are cached client-side by data version; measurements reviewed/finalized elsewhere
    // won't appear until this re-fetches the current version. See HeatmapWorkflow.refresh().
    sectionElement
      .querySelector(".refresh-kpi")
      ?.addEventListener("click", () => this.heatmapWorkflow.refresh());
    this.stopsContainer = sectionElement.querySelector(
      ".palette-stops",
    ) as HTMLElement;
    sectionElement
      .querySelector(".palette-add-stop")
      ?.addEventListener("click", () => this.addStop());
    sectionElement
      .querySelector(".palette-reset")
      ?.addEventListener("click", () => {
        this.heatmapWorkflow.resetPalette();
        this.renderPalette(this.heatmapWorkflow.getPalette());
      });
    this.renderPalette(this.heatmapWorkflow.getPalette());
  }

  /** Reflects current visibility on the toggle button ("Show" ↔ "Hide signal quality"). */
  setToggleState(visible: boolean): void {
    if (!this.toggleButton) return;
    this.toggleButton.textContent = visible
      ? "Hide signal quality"
      : "Show signal quality";
  }

  /** Re-renders the stop editor rows to reflect an externally-set palette (e.g. after reset). */
  renderPalette(palette: SignalQualityPalette): void {
    this.stopsContainer.innerHTML = "";
    palette.forEach((stop, index) => {
      const row = document.createElement("div");
      row.className = "palette-stop";
      row.innerHTML = paletteStopRowTemplate(stop);
      const colorInput = row.querySelector(
        ".palette-color",
      ) as HTMLInputElement;
      const offsetInput = row.querySelector(
        ".palette-offset",
      ) as HTMLInputElement;
      const removeButton = row.querySelector(
        ".palette-remove",
      ) as HTMLButtonElement;

      colorInput.addEventListener("input", () => this.commit());
      offsetInput.addEventListener("change", () => this.commit());
      removeButton.addEventListener("click", () => {
        row.remove();
        this.commit();
      });
      if (palette.length <= 2) removeButton.disabled = true;

      this.stopsContainer.appendChild(row);
    });
  }

  private addStop(): void {
    const current = this.readPalette();
    const midpoint =
      current.length >= 2
        ? (current[current.length - 2].offset +
            current[current.length - 1].offset) /
          2
        : 0.5;
    this.renderPalette([
      ...current.slice(0, -1),
      { offset: Math.round(midpoint * 100) / 100, color: "#808080" },
      current[current.length - 1],
    ]);
    this.commit();
  }

  private commit(): void {
    this.heatmapWorkflow.setPalette(this.readPalette());
  }

  private readPalette(): SignalQualityPalette {
    return [...this.stopsContainer.querySelectorAll(".palette-stop")]
      .map((row) => ({
        color: (row.querySelector(".palette-color") as HTMLInputElement).value,
        offset: Number(
          (row.querySelector(".palette-offset") as HTMLInputElement).value,
        ),
      }))
      .sort((a, b) => a.offset - b.offset);
  }
}

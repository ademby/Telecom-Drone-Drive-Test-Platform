import { MapController } from "../map/MapController";
import OperationsPanel from "../ui/OperationsPanel";
import { HeatmapWorkflow } from "../workflows/heatmap/HeatmapWorkflow";
import { createHeatmapOperationsCallbacks } from "../workflows/heatmap/createHeatmapOperationsCallbacks";
import { MissionWorkflow } from "../workflows/mission/MissionWorkflow";
import { createMissionOperationsCallbacks } from "../workflows/mission/createMissionOperationsCallbacks";
import type { AdminDataset } from "../workflows/navigation/AdminDatasetLoader";
import AdminDatasetLoader from "../workflows/navigation/AdminDatasetLoader";
import type { NavigationState } from "../workflows/navigation/NavigationState";
import { NavigationWorkflow } from "../workflows/navigation/NavigationWorkflow";

export interface CompositionRootOptions {
  datasetURL?: string;
}

function requireApiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!base) {
    throw new Error(
      "VITE_API_BASE_URL is required. Or implement 'same BaseUrl' logic.",
    );
  }
  return base.replace(/\/$/, "");
}

/** Fading advisory on the map surface (mission UI after finalize). */
function showFadingAdvisory(message: string): void {
  const el = document.createElement("div");
  el.className = "map-advisory";
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("map-advisory-visible"));
  window.setTimeout(() => {
    el.classList.remove("map-advisory-visible");
    window.setTimeout(() => el.remove(), 450);
  }, 4500);
}

/**
 * Construct once: map, Apis, renderer, workflows; register panel views; initial load.
 * Does not build feature layers (workflows own those). Does not call heatmap from mission finalize.
 */
export class CompositionRoot {
  readonly mapController: MapController;
  readonly adminDataset: AdminDataset;

  readonly navigationWorkflow: NavigationWorkflow;
  readonly missionWorkflow: MissionWorkflow;
  readonly heatmapWorkflow: HeatmapWorkflow;

  readonly operationsPanel: OperationsPanel;

  private constructor(
    mapController: MapController,
    adminDataset: AdminDataset,
  ) {
    this.mapController = mapController;
    this.adminDataset = adminDataset;

    const apiBase = requireApiBaseUrl();

    this.navigationWorkflow = new NavigationWorkflow({
      mapController: this.mapController,
      adminDataset: this.adminDataset,
    });

    this.heatmapWorkflow = new HeatmapWorkflow({
      mapController: this.mapController,
    });

    const missionCallbacks = createMissionOperationsCallbacks({
      getMissionWorkflow: () => this.missionWorkflow,
      showFadingAdvisory,
    });

    const heatmapCallbacks = createHeatmapOperationsCallbacks({
      heatmapWorkflow: this.heatmapWorkflow,
      getOperationsPanel: () => this.operationsPanel,
    });

    this.operationsPanel = new OperationsPanel(
      missionCallbacks,
      heatmapCallbacks,
      this.heatmapWorkflow.getPalette(),
    );

    this.missionWorkflow = new MissionWorkflow({
      mapController: this.mapController,
      view: this.operationsPanel,
      measurementCallbacks: {
        onSelectionChange: (ids) =>
          this.operationsPanel.setMeasurementSelection(ids),
        onRejectedChange: (ids) =>
          this.operationsPanel.setMeasurementRejection(ids),
      },
    });
  }

  static async create(
    options: CompositionRootOptions = {},
  ): Promise<CompositionRoot> {
    const mapController = new MapController();

    const adminDataset = await AdminDatasetLoader.loadDataset({
      featureProjection: mapController.getProjection(),
      url: options.datasetURL,
    });

    const compositionRoot = new CompositionRoot(mapController, adminDataset);

    compositionRoot.navigationWorkflow.showInitialRoot();
    void compositionRoot.missionWorkflow.load();
    void compositionRoot.heatmapWorkflow.load();

    return compositionRoot;
  }

  get navigation(): NavigationState {
    return this.navigationWorkflow.navigation;
  }
}

export default CompositionRoot;

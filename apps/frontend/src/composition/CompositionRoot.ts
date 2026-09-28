import type { MissionApi } from "@drone-drive/contracts/mission";
import type { MissionResultApi } from "@drone-drive/contracts/mission-result";
import type { SignalQualityApi } from "@drone-drive/contracts/signal-quality";
import Control from "ol/control/Control";
import type { AdminDataset } from "../workflows/navigation/AdminDatasetLoader";
import AdminDatasetLoader from "../workflows/navigation/AdminDatasetLoader";
import HttpMissionApi from "../workflows/mission/HttpMissionApi";
import HttpMissionResultApi from "../workflows/mission/HttpMissionResultApi";
import HttpSignalQualityApi from "../workflows/heatmap/HttpSignalQualityApi";
import { HttpSignalQualityRenderer } from "../workflows/heatmap/SignalQualityRenderer";
import { MapController } from "../map/MapController";
import type { NavigationState } from "../workflows/navigation/NavigationState";
import Breadcrumbs from "../workflows/navigation/Breadcrumbs";
import LocationSearch from "../workflows/navigation/LocationSearch";
import OperationsPanel from "../ui/OperationsPanel";
import { HeatmapWorkflow } from "../workflows/heatmap/HeatmapWorkflow";
import { createHeatmapOperationsCallbacks } from "../workflows/heatmap/createHeatmapOperationsCallbacks";
import { MissionWorkflow } from "../workflows/mission/MissionWorkflow";
import { createMissionOperationsCallbacks } from "../workflows/mission/createMissionOperationsCallbacks";
import { NavigationWorkflow } from "../workflows/navigation/NavigationWorkflow";

export interface CompositionRootOptions {
  datasetURL?: string;
}

function requireApiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!base) {
    throw new Error(
      "VITE_API_BASE_URL is required. Frontend MockMissionApi has been removed.",
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
  readonly missionApi: MissionApi;
  readonly missionResultApi: MissionResultApi;
  readonly signalQualityApi: SignalQualityApi;
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
    this.missionApi = new HttpMissionApi(apiBase);
    this.missionResultApi = new HttpMissionResultApi(apiBase);
    this.signalQualityApi = new HttpSignalQualityApi(apiBase);

    let selectNodeById: (id: string) => void = () => {
      throw new Error("Navigation workflow is not ready.");
    };
    const locationDisplay = new Breadcrumbs((id) => selectNodeById(id));
    this.mapController.map.addControl(locationDisplay);

    this.navigationWorkflow = new NavigationWorkflow({
      mapController: this.mapController,
      adminDataset: this.adminDataset,
      locationDisplay,
    });
    selectNodeById = (id) => this.navigationWorkflow.selectNodeById(id);

    const locationSearch = new LocationSearch({
      options: this.navigationWorkflow.getSearchOptions(),
      onPreviewStart: (node) => this.navigationWorkflow.previewNode(node),
      onPreviewEnd: () => this.navigationWorkflow.restorePreview(),
      onPreviewCommit: (node) => this.navigationWorkflow.commitPreview(node),
      onSelect: (node) => this.navigationWorkflow.selectNode(node),
    });
    this.mapController.map.addControl(
      new Control({ element: locationSearch.element }),
    );

    const renderer = new HttpSignalQualityRenderer(this.signalQualityApi);

    this.heatmapWorkflow = new HeatmapWorkflow({
      mapController: this.mapController,
      signalQualityApi: this.signalQualityApi,
      renderer,
    });

    // Deferred: missionWorkflow.review is needed for panel callbacks; panel is the view.
    let missionWorkflowRef: MissionWorkflow | null = null;

    const missionCallbacks = createMissionOperationsCallbacks({
      getMissionWorkflow: () => {
        if (!missionWorkflowRef) {
          throw new Error("Mission workflow is not ready.");
        }
        return missionWorkflowRef;
      },
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
      missionApi: this.missionApi,
      missionResultApi: this.missionResultApi,
      view: this.operationsPanel,
      setAdminSelectionEnabled: (enabled) =>
        this.navigationWorkflow.setSelectionEnabled(enabled),
      measurementCallbacks: {
        onSelectionChange: (ids) =>
          this.operationsPanel.setMeasurementSelection(ids),
        onRejectedChange: (ids) =>
          this.operationsPanel.setMeasurementRejection(ids),
      },
    });
    missionWorkflowRef = this.missionWorkflow;
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
    void compositionRoot.heatmapWorkflow.load().then(() =>
      compositionRoot.operationsPanel.setSignalQualityToggleState(
        compositionRoot.heatmapWorkflow.isVisible(),
      ),
    );
    return compositionRoot;
  }

  get navigation(): NavigationState {
    return this.navigationWorkflow.navigation;
  }
}

export default CompositionRoot;

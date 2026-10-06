import { MapController } from "../map/MapController";
import OperationsPanel from "./OperationsPanel";
import { HeatmapWorkflow } from "../workflows/heatmap/HeatmapWorkflow";
import { MissionWorkflow } from "../workflows/mission/MissionWorkflow";
import type { AdminDataset } from "../workflows/navigation/AdminDatasetLoader";
import AdminDatasetLoader from "../workflows/navigation/AdminDatasetLoader";
import type { NavigationState } from "../workflows/navigation/NavigationState";
import { NavigationWorkflow } from "../workflows/navigation/NavigationWorkflow";

export interface CompositionRootOptions {
  datasetURL?: string;
}

/**
 * Construct once: map, Apis, renderer, workflows; register panel views; initial load.
 * Does not build feature layers (workflows own those). Does not call heatmap from mission finalize.
 */
export class CompositionRoot {
  readonly mapController: MapController;
  readonly adminDataset: AdminDataset;

  readonly operationsPanel: OperationsPanel;

  readonly navigationWorkflow: NavigationWorkflow;
  readonly missionWorkflow: MissionWorkflow;
  readonly heatmapWorkflow: HeatmapWorkflow;

  private constructor(
    mapController: MapController,
    adminDataset: AdminDataset,
  ) {
    this.mapController = mapController;
    this.adminDataset = adminDataset;

    this.operationsPanel = new OperationsPanel();

    this.navigationWorkflow = new NavigationWorkflow({
      mapController: this.mapController,
      adminDataset: this.adminDataset,
      operationsPanel: this.operationsPanel,
    });

    this.heatmapWorkflow = new HeatmapWorkflow({
      mapController: this.mapController,
      operationsPanel: this.operationsPanel,
    });

    this.missionWorkflow = new MissionWorkflow({
      mapController: this.mapController,
      operationsPanel: this.operationsPanel,
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

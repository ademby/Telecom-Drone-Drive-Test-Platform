import Control from "ol/control/Control.js";
import { click } from "ol/events/condition.js";
import type Feature from "ol/Feature.js";
import type { SelectEvent } from "ol/interaction/Select.js";
import Select from "ol/interaction/Select.js";
import LayerGroup from "ol/layer/Group.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import OperationsPanel from "../../common/OperationsPanel.js";
import { MapController } from "../../map/MapController.js";
import {
  activeStyle,
  contextStyle,
  hoverStyle,
  selectedStyle,
} from "../../map/styles.js";
import type { AdminDataset } from "./AdminDatasetLoader.js";
import { AdminNode } from "./AdminNode.js";
import Breadcrumbs from "./Breadcrumbs.js";
import LocationDisplay from "./LocationDisplay.js";
import LocationSearch from "./LocationSearch.js";
import { NavigationOperationsView } from "./NavigationOperationsView.js";
import type { NavigationState } from "./NavigationState.js";
import { shouldUseDefaultTransition } from "./navigationTransition.js";

export interface NavigationSearchOption {
  readonly node: AdminNode;
  readonly path: string;
  readonly label: string;
}

interface NavigationSnapshot {
  readonly selected: AdminNode | null;
  readonly path: AdminNode[];
  readonly active: AdminNode[];
  readonly context: AdminNode[];
  readonly center: import("ol/coordinate.js").Coordinate;
  readonly zoom: number;
}

export interface NavigationDataset {
  readonly tree: AdminDataset["tree"];
  getNodeById(id: string): AdminNode | undefined;
  getNodeByFeature(feature: Feature): AdminNode | undefined;
}

export interface NavigationWorkflowOptions {
  readonly mapController: MapController;
  readonly adminDataset: NavigationDataset;
  readonly operationsPanel: OperationsPanel;
}

/**
 * Administrative geography navigation: owns admin LayerGroup, Select interaction,
 * and navigation state. Uses MapController only for shared view helpers.
 */
export class NavigationWorkflow {
  readonly navigation: NavigationState = {
    selected: null,
    path: [],
    active: [],
    context: [],
  };

  private readonly mapController: MapController;
  private readonly adminDataset: NavigationDataset;
  private readonly operationsPanel: OperationsPanel;

  private readonly locationDisplay: LocationDisplay;

  private readonly contextSource = new VectorSource();
  private readonly activeSource = new VectorSource();
  private readonly selectionSource = new VectorSource();
  private readonly hoverSource = new VectorSource();

  private readonly activeLayer: VectorLayer<VectorSource>;

  private readonly layerGroup: LayerGroup;

  private readonly adminSelect: Select;

  private previewState: NavigationSnapshot | null = null;

  private navigationView: NavigationOperationsView;

  constructor(options: NavigationWorkflowOptions) {
    this.mapController = options.mapController;
    this.adminDataset = options.adminDataset;
    this.operationsPanel = options.operationsPanel;

    this.locationDisplay = new Breadcrumbs((id) => this.selectNodeById(id));
    this.mapController.map.addControl(this.locationDisplay);

    const contextLayer = new VectorLayer({
      source: this.contextSource,
      style: contextStyle,
      zIndex: 10,
    });
    this.activeLayer = new VectorLayer({
      source: this.activeSource,
      style: activeStyle,
      zIndex: 20,
    });
    const selectionLayer = new VectorLayer({
      source: this.selectionSource,
      style: selectedStyle,
      zIndex: 30,
    });
    const hoverLayer = new VectorLayer({
      source: this.hoverSource,
      style: hoverStyle,
      zIndex: 40,
    });
    this.layerGroup = new LayerGroup({
      layers: [contextLayer, this.activeLayer, selectionLayer, hoverLayer],
    });
    this.mapController.map.addLayer(this.layerGroup);

    this.adminSelect = new Select({
      condition: click,
      layers: [this.activeLayer],
      style: null,
      multi: false,
    });
    this.adminSelect.on("select", (event: SelectEvent) => {
      const feature = event.selected[0];
      if (feature) this.selectNodeByFeature(feature);
    });
    this.mapController.map.addInteraction(this.adminSelect);

    const locationSearch = new LocationSearch({
      options: this.getSearchOptions(),
      onPreviewStart: (node) => this.previewNode(node),
      onPreviewEnd: () => this.restorePreview(),
      onPreviewCommit: (node) => this.commitPreview(node),
      onSelect: (node) => this.selectNode(node),
    });
    this.mapController.map.addControl(
      new Control({ element: locationSearch.element }),
    );

    this.navigationView = new NavigationOperationsView(this);
    this.operationsPanel.registerView(this.navigationView.panelView);
  }

  getSearchOptions(): NavigationSearchOption[] {
    return this.adminDataset.tree.allNodes().map((node) => {
      const path = this.adminDataset.tree.pathTo(node);
      return {
        node,
        label: String(node.feature.get("shapeName") ?? node.id),
        path: path
          .map((item) => String(item.feature.get("shapeName") ?? item.id))
          .join(" / "),
      };
    });
  }

  showInitialRoot(): void {
    const root = this.adminDataset.tree.root;
    this.navigation.selected = null;
    this.navigation.path = [];
    this.navigation.context = [];
    this.navigation.active = [root];
    this.contextSource.clear();
    this.activeSource.clear();
    this.activeSource.addFeature(root.feature);
    this.selectionSource.clear();
    this.locationDisplay.clear();
  }

  selectNode(node: AdminNode | undefined): void {
    if (!node) return;

    const previous = this.navigation.selected;
    const path = this.adminDataset.tree.pathTo(node);
    const activeSet = new Set<AdminNode>();
    for (const child of node.children) activeSet.add(child);
    for (const pathNode of path.slice(1)) {
      if (!pathNode.parent) continue;
      for (const sibling of pathNode.parent.children) {
        if (sibling !== pathNode) activeSet.add(sibling);
      }
    }

    this.navigation.selected = node;
    this.navigation.path = path;
    this.navigation.active = [...activeSet];
    this.navigation.context = path;

    this.contextSource.clear();
    this.contextSource.addFeatures(path.map((item) => item.feature));
    this.activeSource.clear();
    this.activeSource.addFeatures(
      this.navigation.active.map((item) => item.feature),
    );
    this.selectionSource.clear();
    this.selectionSource.addFeature(node.feature);

    if (shouldUseDefaultTransition(previous, node)) {
      this.mapController.fitViewToFeature(node.feature);
    } else {
      this.mapController.fitViewToFeatureHop(node.feature);
    }
    this.locationDisplay.setPath(path);
  }

  selectNodeById(id: string): void {
    this.selectNode(this.adminDataset.getNodeById(id));
  }

  selectNodeByFeature(feature: Feature): void {
    this.selectNode(this.adminDataset.getNodeByFeature(feature));
  }

  previewNode(node: AdminNode): void {
    if (!this.previewState) this.previewState = this.captureNavigation();
    this.selectNode(node);
  }

  restorePreview(): void {
    if (!this.previewState) return;
    const snapshot = this.previewState;
    this.previewState = null;
    this.navigation.selected = snapshot.selected;
    this.navigation.path = snapshot.path;
    this.navigation.active = snapshot.active;
    this.navigation.context = snapshot.context;
    this.contextSource.clear();
    this.contextSource.addFeatures(
      snapshot.context.map((item) => item.feature),
    );
    this.activeSource.clear();
    this.activeSource.addFeatures(snapshot.active.map((item) => item.feature));
    this.selectionSource.clear();
    if (snapshot.selected) {
      this.selectionSource.addFeature(snapshot.selected.feature);
    }
    this.locationDisplay.setPath(snapshot.path);
    this.mapController.hopToView(snapshot.center, snapshot.zoom);
  }

  commitPreview(node: AdminNode): void {
    if (!this.previewState) return;
    this.previewState = null;
    this.navigation.selected = node;
  }

  setSelectionEnabled(enabled: boolean): void {
    this.adminSelect.setActive(enabled);
  }

  toggleSelectionNavigation(): void {
    this.setSelectionEnabled(!this.adminSelect.getActive());
  }

  toggleNavigationLayers(): void {
    this.layerGroup.setVisible(!this.layerGroup.getVisible());
  }

  private captureNavigation(): NavigationSnapshot {
    const { center, zoom } = this.mapController.getViewState();
    return {
      selected: this.navigation.selected,
      path: [...this.navigation.path],
      active: [...this.navigation.active],
      context: [...this.navigation.context],
      center,
      zoom,
    };
  }
}

export default NavigationWorkflow;

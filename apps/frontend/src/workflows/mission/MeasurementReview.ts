import type { MissionResult } from "@drone-drive/contracts/mission-result";
import {
  click,
  platformModifierKeyOnly,
  shiftKeyOnly,
} from "ol/events/condition.js";
import Feature from "ol/Feature.js";
import Point from "ol/geom/Point.js";
import DragBox from "ol/interaction/DragBox.js";
import Select from "ol/interaction/Select.js";
import type VectorLayer from "ol/layer/Vector.js";
import type OlMap from "ol/Map.js";
import { transform } from "ol/proj.js";
import type Projection from "ol/proj/Projection.js";
import type VectorSource from "ol/source/Vector.js";
import { colorMeasurementsBySignalQuality } from "../heatmap/SignalQualityPalette.js";
import MissionWorkflow from "./MissionWorkflow.js";

/** Features built per animation frame while loading a review result. */
const MEASUREMENT_BATCH_SIZE = 500;

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export interface MeasurementReviewCallbacks {
  /** Fired whenever the selected set changes, regardless of whether it came from the map or a row click. */
  onSelectionChange(ids: readonly string[]): void;
  /** Fired whenever approve/reject changes the rejected set. */
  onRejectedChange(rejectedIds: readonly string[]): void;
}

/**
 * Renders a mission result's measurements as points colored by Signal Quality (clamped into
 * the dataset's own min/max, per ADR-0004's client-side presentation split) and owns the
 * interactions that replace per-row checkboxes: click / shift-click to select one or extend,
 * Ctrl(Cmd)+drag to box-select many, and approve/reject acting on whatever is selected.
 */
export class MeasurementReviewController {
  private readonly missionWorkflow: MissionWorkflow;
  private readonly source: VectorSource;
  private readonly projection: Projection;
  private readonly selectInteraction: Select;
  private readonly dragBox: DragBox;
  private featuresById = new Map<string, Feature<Point>>();
  private rejectedIds = new Set<string>();
  private loadToken = 0;

  constructor(
    map: OlMap,
    source: VectorSource,
    layer: VectorLayer<VectorSource>,
    projection: Projection,
    missionWorkflow: MissionWorkflow,
  ) {
    this.source = source;
    this.projection = projection;
    this.missionWorkflow = missionWorkflow;

    // Plain click selects just that point; shift-click toggles it into/out of the existing
    // selection. Scoped to the measurement layer so it can't steal clicks meant for the
    // route editor or the admin-boundary select (see NavigationWorkflow's own scoped Select).
    this.selectInteraction = new Select({
      condition: click,
      toggleCondition: shiftKeyOnly,
      layers: [layer],
      style: null,
      multi: false,
      hitTolerance: 5,
    });
    this.selectInteraction.on("select", () =>
      this.syncSelectionFromInteraction(),
    );
    map.addInteraction(this.selectInteraction);

    // Ctrl/Cmd+drag rubber-bands a box; everything enclosed becomes the new selection.
    this.dragBox = new DragBox({ condition: platformModifierKeyOnly });
    this.dragBox.on("boxend", () => {
      const extent = this.dragBox.getGeometry().getExtent();
      const enclosed: Feature<Point>[] = [];
      this.source.forEachFeatureIntersectingExtent(extent, (feature) => {
        enclosed.push(feature as Feature<Point>);
      });
      const collection = this.selectInteraction.getFeatures();
      collection.clear();
      for (const feature of enclosed) collection.push(feature);
      this.syncSelectionFromInteraction();
    });
    map.addInteraction(this.dragBox);
  }

  /** Builds map features in batches across animation frames rather than one synchronous pass:
   *  a large drive-test result (thousands of measurements) otherwise blocks the main thread long
   *  enough that the whole UI appears frozen. `clear()` bumps `loadToken` so a stale in-progress
   *  load (operator switched missions mid-render) stops instead of racing the new one. */
  async load(result: MissionResult): Promise<void> {
    this.clear();
    const token = this.loadToken;
    this.rejectedIds = new Set(
      result.activeRevision?.rejectedMeasurementIds ?? [],
    );
    const colors = colorMeasurementsBySignalQuality(result.measurements);

    let batch: Feature<Point>[] = [];
    for (const measurement of result.measurements) {
      if (token !== this.loadToken) return;
      const coordinates = transform(
        [measurement.longitude, measurement.latitude],
        "EPSG:4326",
        this.projection,
      );
      const feature = new Feature(new Point(coordinates));
      feature.setId(measurement.id);
      feature.set("color", colors.get(measurement.id) ?? "#888888");
      feature.set("rejected", this.rejectedIds.has(measurement.id));
      feature.set("selected", false);
      this.featuresById.set(measurement.id, feature);
      batch.push(feature);

      if (batch.length >= MEASUREMENT_BATCH_SIZE) {
        this.source.addFeatures(batch);
        batch = [];
        await yieldToMainThread();
      }
    }
    if (batch.length) this.source.addFeatures(batch);
  }

  clear(): void {
    this.loadToken += 1;
    this.selectInteraction.getFeatures().clear();
    this.source.clear();
    this.featuresById.clear();
    this.rejectedIds = new Set();
  }

  /** Entry point for a click on a result-list row, mirroring shift-click's additive behavior. */
  selectById(id: string, additive: boolean): void {
    const feature = this.featuresById.get(id);
    if (!feature) return;
    const collection = this.selectInteraction.getFeatures();
    const alreadySelected = collection.getArray().includes(feature);
    if (!additive) collection.clear();
    if (additive && alreadySelected) collection.remove(feature);
    else if (!alreadySelected || !additive) collection.push(feature);
    this.syncSelectionFromInteraction();
  }

  selectAll(): void {
    const collection = this.selectInteraction.getFeatures();
    collection.clear();
    for (const feature of this.featuresById.values()) collection.push(feature);
    this.syncSelectionFromInteraction();
  }

  invertSelection(): void {
    const collection = this.selectInteraction.getFeatures();
    const currentlySelected = new Set(collection.getArray());
    collection.clear();
    for (const feature of this.featuresById.values()) {
      if (!currentlySelected.has(feature)) collection.push(feature);
    }
    this.syncSelectionFromInteraction();
  }

  clearSelection(): void {
    this.selectInteraction.getFeatures().clear();
    this.syncSelectionFromInteraction();
  }

  approveSelected(): void {
    for (const feature of this.selectInteraction.getFeatures().getArray()) {
      this.rejectedIds.delete(String(feature.getId()));
      feature.set("rejected", false);
      feature.changed();
    }
    this.missionWorkflow.setMeasurementRejection(this.getRejectedIds());
  }

  rejectSelected(): void {
    for (const feature of this.selectInteraction.getFeatures().getArray()) {
      this.rejectedIds.add(String(feature.getId()));
      feature.set("rejected", true);
      feature.changed();
    }
    this.missionWorkflow.setMeasurementRejection(this.getRejectedIds());
  }

  getRejectedIds(): readonly string[] {
    return Array.from(this.rejectedIds);
  }

  getSelectedIds(): readonly string[] {
    return this.selectInteraction
      .getFeatures()
      .getArray()
      .map((feature) => String(feature.getId()));
  }

  private syncSelectionFromInteraction(): void {
    const selectedIds = new Set(this.getSelectedIds());
    for (const [id, feature] of this.featuresById) {
      const isSelected = selectedIds.has(id);
      if (feature.get("selected") !== isSelected) {
        feature.set("selected", isSelected);
        feature.changed();
      }
    }
    this.missionWorkflow.setMeasurementSelection(Array.from(selectedIds));
  }
}

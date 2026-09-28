import type { Mission, MissionApi, MissionId } from "@drone-drive/contracts/mission";
import type { MissionResult, MissionResultApi } from "@drone-drive/contracts/mission-result";
import LayerGroup from "ol/layer/Group.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import { MapController } from "../../map/MapController.js";
import { measurementStyle, missionStyle } from "../../map/styles.js";
import HttpMissionApi from "./HttpMissionApi.js";
import HttpMissionResultApi from "./HttpMissionResultApi.js";
import {
  MeasurementReviewController,
  type MeasurementReviewCallbacks,
} from "./MeasurementReview.js";
import {
  MissionEditor,
  type MissionEditorMode,
} from "./MissionEditor.js";
import { droneId, missionId } from "./missionIds.js";
import type { MissionFormData } from "./MissionOperationsView.js";

export type { MissionFormData } from "./MissionOperationsView.js";

export interface MissionWorkflowView {
  renderMissions(missions: readonly Mission[], selectedId: string | null): void;
  setEditor(mission: Mission | null, title: string): void;
  showReview(mission: Mission): void;
  setActiveTool(mode: MissionEditorMode): void;
  showMissionList(): void;
  setResult(result: MissionResult | null): void;
  setResultStatusMessage(message: string): void;
}

export interface MissionWorkflowOptions {
  readonly mapController: MapController;
  readonly view: MissionWorkflowView;
  readonly measurementCallbacks: MeasurementReviewCallbacks;
}

/**
 * Mission application decisions. Owns route + measurement LayerGroup,
 * MissionEditor, and MeasurementReview (ADR-0005 / R-07).
 */
export class MissionWorkflow {
  private readonly mapController: MapController;
  private readonly missionApi: MissionApi;
  private readonly missionResultApi: MissionResultApi | undefined;
  private readonly missionEditor: MissionEditor;
  private readonly measurementReview: MeasurementReviewController;
  private readonly missionSource = new VectorSource();
  private readonly view: MissionWorkflowView;
  private missions: Mission[] = [];
  private selectedMissionId: string | null = null;
  private editingMissionId: MissionId | null = null;

  constructor(options: MissionWorkflowOptions) {
    this.mapController = options.mapController;

    this.missionApi = new HttpMissionApi();
    this.missionResultApi = new HttpMissionResultApi();

    this.view = options.view;

    const measurementSource = new VectorSource();
    const missionLayer = new VectorLayer({
      source: this.missionSource,
      style: missionStyle,
      zIndex: 50,
    });
    const measurementLayer = new VectorLayer({
      source: measurementSource,
      style: measurementStyle,
      zIndex: 55,
    });
    this.mapController.map.addLayer(
      new LayerGroup({ layers: [missionLayer, measurementLayer] }),
    );

    this.missionEditor = new MissionEditor(
      this.mapController.map,
      this.missionSource,
      this.mapController.getProjection(),
      (mode) => this.handleEditorMode(mode),
    );

    this.measurementReview = new MeasurementReviewController(
      this.mapController.map,
      measurementSource,
      measurementLayer,
      this.mapController.getProjection(),
      options.measurementCallbacks,
    );
  }

  /** Exposed for OperationsPanel measurement wiring. */
  get review(): MeasurementReviewController {
    return this.measurementReview;
  }

  async load(): Promise<void> {
    this.missions = [...(await this.missionApi.list())];
    this.renderMissionList();
  }

  create(): void {
    const now = new Date(Date.now() + 15 * 60_000).toISOString();
    this.editingMissionId = null;
    this.selectedMissionId = null;
    this.missionEditor.startNew();
    this.measurementReview.clear();
    const draft: Mission = {
      id: missionId("draft"),
      name: "",
      state: "DRAFT",
      droneId: droneId("drone-alpha"),
      earliestStart: now,
      dispatchDeadline: null,
      activeRoute: {
        id: "route-draft" as Mission["activeRoute"]["id"],
        revision: 0,
        geometry: { type: "LineString", coordinates: [] },
        createdAt: now,
      },
      routeHistory: [],
      failureReason: null,
      derivedFrom: null,
    };
    this.view.setEditor(draft, "New mission");
    this.renderMissionList();
  }

  select(id: string): void {
    const mission = this.missions.find((item) => item.id === id);
    if (!mission) return;
    this.editingMissionId = mission.id;
    this.selectedMissionId = mission.id;
    this.missionEditor.load(mission);
    this.measurementReview.clear();
    if (mission.state === "COMPLETED" || mission.state === "FAILED") {
      this.view.showReview(mission);
    } else {
      this.view.setEditor(mission, "Edit mission");
    }
    this.renderMissionList();
    if (mission.activeRoute.geometry.coordinates.length > 1) {
      this.fitMission(mission.id);
    }
    void this.loadResult(mission);
  }

  private async loadResult(mission: Mission): Promise<void> {
    if (!this.missionResultApi) return;
    if (mission.state !== "COMPLETED" && mission.state !== "FAILED") return;
    try {
      const result = await this.missionResultApi.get(mission.id);
      if (this.editingMissionId !== mission.id) return;
      this.view.setResult(result);
      this.measurementReview.load(result);
    } catch {
      if (this.editingMissionId === mission.id) this.view.setResult(null);
    }
  }

  /** Returns whether the revision was saved (callers may show advisory UI after finalize). */
  async saveReview(
    rejectedMeasurementIds: readonly string[],
    finalize: boolean,
  ): Promise<boolean> {
    if (!this.missionResultApi || !this.editingMissionId) return false;
    try {
      const result = await this.missionResultApi.review(
        this.editingMissionId,
        {
          rejectedMeasurementIds: rejectedMeasurementIds as never,
          finalize,
        },
        `review-${this.editingMissionId}-${Date.now()}`,
      );
      this.view.setResult(result);
      this.measurementReview.load(result);
      return true;
    } catch (error: unknown) {
      this.view.setResultStatusMessage(
        errorMessage(error, "Failed to save review."),
      );
      return false;
    }
  }

  startDraw(): void {
    this.missionEditor.startDraw();
  }

  startModify(): void {
    this.missionEditor.startModify();
  }

  startTranslate(): void {
    this.missionEditor.startTranslate();
  }

  undo(): void {
    this.missionEditor.undo();
  }

  redo(): void {
    this.missionEditor.redo();
  }

  handleEditorMode(mode: MissionEditorMode): void {
    this.view.setActiveTool(mode);
    this.setEditorCursor(mode);
  }

  async save(data: MissionFormData): Promise<void> {
    if (!this.missionEditor.hasValidGeometry()) {
      window.alert("Create a route with at least two points before saving.");
      return;
    }

    try {
      if (this.editingMissionId) {
        const updated = await this.missionApi.updateDraft(this.editingMissionId, {
          name: data.name,
          droneId: data.droneId,
          earliestStart: data.earliestStart,
          dispatchDeadline: data.dispatchDeadline,
          geometry: this.missionEditor.getGeometry(),
        });
        this.missions = this.missions.map((mission) =>
          mission.id === updated.id ? updated : mission,
        );
        this.selectedMissionId = updated.id;
      } else {
        const created = await this.missionApi.create({
          name: data.name,
          droneId: data.droneId,
          earliestStart: data.earliestStart,
          dispatchDeadline: data.dispatchDeadline,
          geometry: this.missionEditor.getGeometry(),
        });
        this.missions = [created, ...this.missions];
        this.selectedMissionId = created.id;
        this.editingMissionId = created.id;
      }
      this.missionEditor.stop();
      this.renderMissionList();
      const saved = this.missions.find(
        (mission) => mission.id === this.selectedMissionId,
      );
      if (saved) {
        this.missionEditor.load(saved);
        this.view.setEditor(saved, "Edit mission");
      }
    } catch (error: unknown) {
      window.alert(errorMessage(error, "Failed to save mission."));
    }
  }

  async plan(): Promise<void> {
    if (!this.editingMissionId) return;
    try {
      const planned = await this.missionApi.plan(
        this.editingMissionId,
        `plan-${this.editingMissionId}`,
      );
      this.missions = this.missions.map((mission) =>
        mission.id === planned.id ? planned : mission,
      );
      this.view.renderMissions(this.missions, this.selectedMissionId);
      this.view.setEditor(planned, "Planned mission");
    } catch (error: unknown) {
      window.alert(errorMessage(error, "Failed to plan mission."));
    }
  }

  async cancelMission(): Promise<void> {
    if (!this.editingMissionId) return;
    try {
      const cancelled = await this.missionApi.cancel(
        this.editingMissionId,
        `cancel-${this.editingMissionId}`,
      );
      this.missions = this.missions.map((mission) =>
        mission.id === cancelled.id ? cancelled : mission,
      );
      this.view.setEditor(cancelled, "Cancelled mission");
      this.renderMissionList();
    } catch (error: unknown) {
      window.alert(errorMessage(error, "Failed to cancel mission."));
    }
  }

  async retry(): Promise<void> {
    if (!this.editingMissionId) return;
    try {
      const derived = await this.missionApi.deriveFromFailure(
        this.editingMissionId,
        `derive-${this.editingMissionId}`,
      );
      this.missions = [derived, ...this.missions];
      this.editingMissionId = derived.id;
      this.selectedMissionId = derived.id;
      this.missionEditor.load(derived);
      this.view.setEditor(derived, "New mission (retry)");
      this.renderMissionList();
    } catch (error: unknown) {
      window.alert(errorMessage(error, "Failed to create a retry mission."));
    }
  }

  cancel(): void {
    this.missionEditor.stop();
    if (this.editingMissionId) {
      const mission = this.missions.find(
        (item) => item.id === this.editingMissionId,
      );
      if (mission) {
        this.missionEditor.load(mission);
        this.view.setEditor(mission, "Edit mission");
        return;
      }
    }
    this.clearMission();
    this.selectedMissionId = null;
    this.editingMissionId = null;
    this.view.showMissionList();
    this.renderMissionList();
  }

  back(): void {
    this.missionEditor.stop();
    this.clearMission();
    this.measurementReview.clear();
    this.selectedMissionId = null;
    this.editingMissionId = null;
    this.view.showMissionList();
    this.renderMissionList();
  }

  private fitMission(id: MissionId): void {
    const feature = this.missionSource.getFeatureById(id);
    if (feature) this.mapController.fitViewToFeature(feature);
  }

  private clearMission(): void {
    this.missionSource.clear();
  }

  private setEditorCursor(mode: MissionEditorMode): void {
    const target = this.mapController.map.getTargetElement();
    if (!(target instanceof HTMLElement)) return;
    target.classList.remove("cursor-draw", "cursor-modify", "cursor-translate");
    if (mode !== "idle") target.classList.add(`cursor-${mode}`);
  }

  private renderMissionList(): void {
    this.view.renderMissions(this.missions, this.selectedMissionId);
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default MissionWorkflow;

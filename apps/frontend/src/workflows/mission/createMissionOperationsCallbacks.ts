import type { MissionFormData, MissionOperationsViewCallbacks } from "./MissionOperationsView.js";
import type { MissionWorkflow } from "./MissionWorkflow.js";

export interface MissionOperationsCallbacksDeps {
  /**
   * Deferred getter: MissionWorkflow is constructed after the callbacks object
   * (panel must exist first). Callers must only invoke handlers after init.
   */
  getMissionWorkflow: () => MissionWorkflow;
  showFadingAdvisory: (message: string) => void;
}

/**
 * Builds MissionOperationsViewCallbacks by wiring UI events to MissionWorkflow.
 * Lives with the mission workflow so CompositionRoot only injects deps.
 */
export function createMissionOperationsCallbacks(
  deps: MissionOperationsCallbacksDeps,
): MissionOperationsViewCallbacks {
  const { getMissionWorkflow, showFadingAdvisory } = deps;

  return {
    onNew: () => getMissionWorkflow().create(),
    onSelect: (id: string) => getMissionWorkflow().select(id),
    onDraw: () => getMissionWorkflow().startDraw(),
    onModify: () => getMissionWorkflow().startModify(),
    onTranslate: () => getMissionWorkflow().startTranslate(),
    onUndo: () => getMissionWorkflow().undo(),
    onRedo: () => getMissionWorkflow().redo(),
    onSave: (data: MissionFormData) => void getMissionWorkflow().save(data),
    onPlan: () => void getMissionWorkflow().plan(),
    onCancel: () => getMissionWorkflow().cancel(),
    onBack: () => getMissionWorkflow().back(),
    onCancelMission: () => void getMissionWorkflow().cancelMission(),
    onRetryMission: () => void getMissionWorkflow().retry(),
    onSaveReview: () => {
      const workflow = getMissionWorkflow();
      const review = workflow.review;
      if (!review) return;
      void workflow.saveReview(review.getRejectedIds(), false);
    },
    onFinalizeReview: () => {
      const workflow = getMissionWorkflow();
      const review = workflow.review;
      if (!review) return;
      void (async () => {
        const saved = await workflow.saveReview(review.getRejectedIds(), true);
        if (saved) {
          showFadingAdvisory(
            "Result finalized. Refresh the heatmap to see updated Signal Quality.",
          );
        }
      })();
    },
    onSelectMeasurement: (id: string, additive: boolean) =>
      getMissionWorkflow().review.selectById(id, additive),
    onSelectAllMeasurements: () => getMissionWorkflow().review.selectAll(),
    onInvertMeasurementSelection: () =>
      getMissionWorkflow().review.invertSelection(),
    onClearMeasurementSelection: () =>
      getMissionWorkflow().review.clearSelection(),
    onApproveSelectedMeasurements: () =>
      getMissionWorkflow().review.approveSelected(),
    onRejectSelectedMeasurements: () =>
      getMissionWorkflow().review.rejectSelected(),
  };
}

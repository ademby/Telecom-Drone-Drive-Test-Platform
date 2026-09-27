import type { DroneId, Mission, MissionState } from '@drone-drive/contracts/mission';
import type { MissionEditorMode } from './MissionEditor.js';
import type { MissionResult } from '@drone-drive/contracts/mission-result';
import { colorMeasurementsBySignalQuality } from '../heatmap/SignalQualityPalette.js';
import type { PanelView } from '../../ui/PanelView.js';
import {
  missionsNavCardTemplate,
  missionsSectionTemplate,
  missionEditorSectionTemplate,
  missionReviewSectionTemplate,
} from './MissionOperationsViewTemplate.js';

export interface MissionOperationsViewCallbacks {
  onNew(): void;
  onSelect(id: string): void;
  onDraw(): void;
  onModify(): void;
  onTranslate(): void;
  onUndo(): void;
  onRedo(): void;
  onSave(data: MissionFormData): void;
  onPlan(): void;
  onCancel(): void;
  onBack(): void;
  onCancelMission(): void;
  onRetryMission(): void;
  onSaveReview(): void;
  onFinalizeReview(): void;
  onSelectMeasurement(id: string, additive: boolean): void;
  onSelectAllMeasurements(): void;
  onInvertMeasurementSelection(): void;
  onClearMeasurementSelection(): void;
  onApproveSelectedMeasurements(): void;
  onRejectSelectedMeasurements(): void;
}

export interface MissionFormData {
  name: string;
  droneId: DroneId;
  earliestStart: string;
  dispatchDeadline: string | null;
}

export class MissionOperationsView {
  /** One `PanelView` per section this workflow owns, for `OperationsPanel.registerView`.
   *  Only "missions" carries a home nav card; editor/review are reached from it.
   *  See docs/adr/0005-workflow-owned-map-surface-and-ui.md. */
  readonly panelViews: readonly PanelView[];
  private readonly listElement: HTMLElement;
  private readonly editorElement: HTMLElement;
  private readonly reviewElement: HTMLElement;
  private readonly callbacks: MissionOperationsViewCallbacks;
  private readonly list: HTMLDivElement;
  private readonly nameInput: HTMLInputElement;
  private readonly startInput: HTMLInputElement;
  private readonly deadlineInput: HTMLInputElement;
  private readonly droneSelect: HTMLSelectElement;
  private readonly planButton: HTMLButtonElement;
  private readonly cancelMissionButton: HTMLButtonElement;
  private readonly retryMissionButton: HTMLButtonElement;
  private readonly reviewMissionName: HTMLElement;
  private readonly reviewStateBadge: HTMLElement;
  private readonly resultLoading: HTMLElement;
  private readonly resultEmpty: HTMLElement;
  private readonly resultToolbar: HTMLElement;
  private readonly selectionSummary: HTMLElement;
  private readonly resultList: HTMLUListElement;
  private readonly resultStatus: HTMLElement;
  private readonly saveReviewButton: HTMLButtonElement;
  private readonly finalizeReviewButton: HTMLButtonElement;
  private renderToken = 0;
  private rowsById = new Map<string, HTMLLIElement>();
  private measurementCount = 0;

  constructor(callbacks: MissionOperationsViewCallbacks) {
    const navCardElement = document.createElement('div');
    navCardElement.className = 'panel-group';
    navCardElement.innerHTML = missionsNavCardTemplate;

    const listElement = document.createElement('section');
    listElement.className = 'panel-view panel-missions hidden';
    listElement.innerHTML = missionsSectionTemplate;

    const editorElement = document.createElement('section');
    editorElement.className = 'panel-view panel-editor hidden';
    editorElement.innerHTML = missionEditorSectionTemplate;

    const reviewElement = document.createElement('section');
    reviewElement.className = 'panel-view panel-review hidden';
    reviewElement.innerHTML = missionReviewSectionTemplate;

    this.listElement = listElement;
    this.editorElement = editorElement;
    this.reviewElement = reviewElement;
    this.panelViews = [
      { id: 'missions', title: 'Missions', sectionElement: listElement, navCardElement },
      // Reached only from the missions list; each already wires its own
      // .back-button below to MissionWorkflow.back(), not a plain panel
      // navigation change, so registerView must not auto-wire it too.
      { id: 'editor', title: 'Mission editor', sectionElement: editorElement, autoWireBackButton: false },
      { id: 'review', title: 'Mission validation', sectionElement: reviewElement, autoWireBackButton: false },
    ];

    this.callbacks = callbacks;
    this.list = listElement.querySelector('.mission-list') as HTMLDivElement;
    this.nameInput = editorElement.querySelector('input[name="name"]') as HTMLInputElement;
    this.startInput = editorElement.querySelector('input[name="start"]') as HTMLInputElement;
    this.deadlineInput = editorElement.querySelector('input[name="deadline"]') as HTMLInputElement;
    this.droneSelect = editorElement.querySelector('select[name="drone"]') as HTMLSelectElement;
    this.planButton = editorElement.querySelector('.plan') as HTMLButtonElement;
    this.cancelMissionButton = editorElement.querySelector('.cancel-mission') as HTMLButtonElement;
    this.retryMissionButton = editorElement.querySelector('.retry-mission') as HTMLButtonElement;
    this.reviewMissionName = reviewElement.querySelector('.review-mission-name') as HTMLElement;
    this.reviewStateBadge = reviewElement.querySelector('.review-state-badge') as HTMLElement;
    this.resultLoading = reviewElement.querySelector('.result-loading') as HTMLElement;
    this.resultEmpty = reviewElement.querySelector('.result-empty') as HTMLElement;
    this.resultToolbar = reviewElement.querySelector('.result-toolbar') as HTMLElement;
    this.selectionSummary = reviewElement.querySelector('.selection-summary') as HTMLElement;
    this.resultList = reviewElement.querySelector('.result-measurements') as HTMLUListElement;
    this.resultStatus = reviewElement.querySelector('.result-status') as HTMLElement;
    this.saveReviewButton = reviewElement.querySelector('.save-review') as HTMLButtonElement;
    this.finalizeReviewButton = reviewElement.querySelector('.finalize-review') as HTMLButtonElement;

    listElement.querySelector('.new-mission')?.addEventListener('click', () => callbacks.onNew());
    editorElement.querySelector('.save')?.addEventListener('click', () => callbacks.onSave(this.getFormData()));
    editorElement.querySelector('.plan')?.addEventListener('click', () => callbacks.onPlan());
    editorElement.querySelector('.cancel')?.addEventListener('click', () => callbacks.onCancel());
    editorElement.querySelector('.back-button')?.addEventListener('click', () => callbacks.onBack());
    reviewElement.querySelector('.back-button')?.addEventListener('click', () => callbacks.onBack());
    this.cancelMissionButton.addEventListener('click', () => {
      if (window.confirm('Cancel this mission? This cannot be undone.')) callbacks.onCancelMission();
    });
    this.retryMissionButton.addEventListener('click', () => callbacks.onRetryMission());
    this.saveReviewButton.addEventListener('click', () => callbacks.onSaveReview());
    this.finalizeReviewButton.addEventListener('click', () => callbacks.onFinalizeReview());
    reviewElement.querySelector('.select-all-measurements')?.addEventListener('click', () => callbacks.onSelectAllMeasurements());
    reviewElement.querySelector('.invert-measurement-selection')?.addEventListener('click', () => callbacks.onInvertMeasurementSelection());
    reviewElement.querySelector('.clear-measurement-selection')?.addEventListener('click', () => callbacks.onClearMeasurementSelection());
    reviewElement.querySelector('.approve-selected-measurements')?.addEventListener('click', () => callbacks.onApproveSelectedMeasurements());
    reviewElement.querySelector('.reject-selected-measurements')?.addEventListener('click', () => callbacks.onRejectSelectedMeasurements());
    editorElement.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
      const tool = (button as HTMLButtonElement).dataset.tool;
      if (tool === 'draw') callbacks.onDraw();
      if (tool === 'modify') callbacks.onModify();
      if (tool === 'translate') callbacks.onTranslate();
      if (tool === 'undo') callbacks.onUndo();
      if (tool === 'redo') callbacks.onRedo();
    }));
  }

  renderMissions(missions: readonly Mission[], selectedId: string | null): void {
    this.list.replaceChildren();
    if (!missions.length) {
      this.list.innerHTML = '<p class="panel-empty">No missions yet. Create a mission to begin.</p>';
      return;
    }
    for (const mission of missions) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `mission-row ${mission.id === selectedId ? 'selected' : ''}`;
      row.innerHTML = `<span>${escapeHtml(mission.name || 'Untitled mission')}</span><small>${formatState(mission.state)}</small>`;
      row.addEventListener('click', () => this.callbacks.onSelect(mission.id));
      this.list.appendChild(row);
    }
  }

  /** Mission CRUD: draft/planned/dispatched/running lifecycle — path editing, scheduling, plan/cancel/retry. */
  setEditor(mission: Mission | null, title: string): void {
    const heading = this.editorElement.querySelector('.mission-editor h3');
    if (heading) heading.textContent = title;
    if (!mission) return;
    this.nameInput.value = mission.name;
    this.startInput.value = toLocalInputValue(mission.earliestStart);
    this.deadlineInput.value = mission.dispatchDeadline ? toLocalInputValue(mission.dispatchDeadline) : '';
    this.droneSelect.value = mission.droneId;
    const editable = mission.state === 'DRAFT';
    this.nameInput.disabled = !editable;
    this.startInput.disabled = !editable;
    this.deadlineInput.disabled = !editable;
    this.droneSelect.disabled = !editable;
    this.planButton.disabled = !editable;
    this.planButton.classList.toggle('hidden', !editable);
    this.editorElement.querySelector('.save')?.classList.toggle('hidden', !editable);
    const cancellable = mission.state === 'PLANNED' || mission.state === 'DISPATCHED' || mission.state === 'RUNNING';
    this.cancelMissionButton.classList.toggle('hidden', !cancellable);
    this.retryMissionButton.classList.toggle('hidden', mission.state !== 'FAILED');
    this.editorElement.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => { button.disabled = !editable; });
  }

  /** Mission validation: reviewing/approving a COMPLETED or FAILED mission's uploaded measurements.
   * A distinct panel view from `setEditor`'s CRUD form, so reviewing never looks like editing. */
  showReview(mission: Mission): void {
    this.reviewMissionName.textContent = mission.name || 'Untitled mission';
    this.reviewStateBadge.textContent = formatState(mission.state);
    this.reviewStateBadge.className = `review-state-badge state-${mission.state.toLowerCase()}`;
    this.setResultLoading();
  }

  /** Distinct from `setResult(null)`: the result hasn't come back yet, it isn't confirmed
   *  absent. Without this the empty state flashed "No result uploaded yet" for every mission
   *  while the fetch was still in flight. */
  setResultLoading(): void {
    this.renderToken += 1;
    this.resultStatus.textContent = '';
    this.resultList.replaceChildren();
    this.rowsById.clear();
    this.resultLoading.classList.remove('hidden');
    this.resultEmpty.classList.add('hidden');
    this.measurementCount = 0;
    this.saveReviewButton.classList.add('hidden');
    this.finalizeReviewButton.classList.add('hidden');
    this.resultToolbar.classList.add('hidden');
    this.updateSelectionSummary(0, 0);
  }

  setResult(result: MissionResult | null): void {
    const token = ++this.renderToken;
    this.resultStatus.textContent = '';
    this.resultList.replaceChildren();
    this.rowsById.clear();
    this.resultLoading.classList.add('hidden');
    this.resultEmpty.classList.toggle('hidden', result !== null);
    const hasMeasurements = Boolean(result && result.measurements.length);
    this.measurementCount = hasMeasurements ? result!.measurements.length : 0;
    this.saveReviewButton.classList.toggle('hidden', !hasMeasurements);
    this.finalizeReviewButton.classList.toggle('hidden', !hasMeasurements);
    this.resultToolbar.classList.toggle('hidden', !hasMeasurements);
    if (!result) {
      this.updateSelectionSummary(0, 0);
      return;
    }

    const rejected = new Set(result.activeRevision?.rejectedMeasurementIds ?? []);
    void this.renderRows(result, rejected, token);
    this.updateSelectionSummary(0, rejected.size);
    if (result.activeRevision?.finalizedAt) {
      this.resultStatus.textContent = `Finalized revision ${result.activeRevision.revision} (${result.measurements.length - rejected.size} approved).`;
    } else if (result.revisionHistory.length) {
      this.resultStatus.textContent = 'Reviewed, not yet finalized.';
    } else {
      this.resultStatus.textContent = 'Not yet reviewed.';
    }
  }

  /** Builds result rows in batches across animation frames instead of one long synchronous
   *  loop, so a large result (drive tests can produce thousands of measurements) doesn't block
   *  the main thread — the "Back" button and everything else stays responsive while it renders.
   *  `token` guards against a stale render finishing after a newer `setResult`/`setResultLoading`
   *  call (e.g. the operator picked a different mission mid-render). */
  private async renderRows(result: MissionResult, rejected: ReadonlySet<string>, token: number): Promise<void> {
    const colors = colorMeasurementsBySignalQuality(result.measurements);
    const fragment = document.createDocumentFragment();
    const batchRows: HTMLLIElement[] = [];

    for (let i = 0; i < result.measurements.length; i += 1) {
      if (token !== this.renderToken) return;
      const measurement = result.measurements[i];
      const kpis = Object.entries(measurement.rawObservations).map(([key, value]) => `${key}: ${value}`).join(', ');
      const row = document.createElement('li');
      row.className = 'result-measurement';
      row.dataset.id = measurement.id;
      row.classList.toggle('rejected', rejected.has(measurement.id));
      row.innerHTML = `
        <span class="swatch" style="background:${colors.get(measurement.id) ?? '#888888'}"></span>
        <span class="result-measurement-label">${new Date(measurement.capturedAt).toLocaleString()} · ${escapeHtml(measurement.source)} · ${escapeHtml(kpis)}</span>
        <span class="result-measurement-badge">${rejected.has(measurement.id) ? 'Rejected' : 'Approved'}</span>`;
      row.addEventListener('click', (event) => {
        this.callbacks.onSelectMeasurement(measurement.id, (event as MouseEvent).shiftKey);
      });
      fragment.appendChild(row);
      batchRows.push(row);

      if (batchRows.length >= RESULT_ROW_BATCH_SIZE || i === result.measurements.length - 1) {
        this.resultList.appendChild(fragment);
        for (const batchRow of batchRows) this.rowsById.set(batchRow.dataset.id as string, batchRow);
        batchRows.length = 0;
        await yieldToMainThread();
      }
    }
  }

  /** Reflects the map/list selection, regardless of whether it originated from a click, a
   * shift-click, a box-select on the map, or a row click here. */
  setMeasurementSelection(ids: readonly string[]): void {
    const selected = new Set(ids);
    for (const [id, row] of this.rowsById) {
      row.classList.toggle('selected', selected.has(id));
    }
    const rejectedCount = Array.from(this.rowsById.values()).filter((row) => row.classList.contains('rejected')).length;
    this.updateSelectionSummary(selected.size,   rejectedCount);
  }

  /** Reflects an approve/reject action taken on the map or via the toolbar, without waiting
   * for the next server round trip (Save/Finalize apply this set; this just keeps the list honest). */
  setMeasurementRejection(rejectedIds: readonly string[]): void {
    const rejected = new Set(rejectedIds);
    let selectedCount = 0;
    for (const [id, row] of this.rowsById) {
      row.classList.toggle('rejected', rejected.has(id));
      const badge = row.querySelector('.result-measurement-badge');
      if (badge) badge.textContent = rejected.has(id) ? 'Rejected' : 'Approved';
      if (row.classList.contains('selected')) selectedCount += 1;
    }
    this.updateSelectionSummary(selectedCount, rejected.size);
  }

  setResultStatusMessage(message: string): void {
    this.resultStatus.textContent = message;
  }

  private updateSelectionSummary(selectedCount: number, rejectedCount: number): void {
    this.selectionSummary.textContent =
      `${selectedCount} selected · ${rejectedCount} rejected / ${this.measurementCount} total`;
  }

  setActiveTool(mode: MissionEditorMode): void {
    this.editorElement.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tool === mode);
      button.setAttribute('aria-pressed', button.dataset.tool === mode ? 'true' : 'false');
    });
  }

  getFormData(): MissionFormData {
    return {
      name: this.nameInput.value.trim() || 'Untitled mission',
      droneId: this.droneSelect.value as DroneId,
      earliestStart: new Date(this.startInput.value).toISOString(),
      dispatchDeadline: this.deadlineInput.value ? new Date(this.deadlineInput.value).toISOString() : null,
    };
  }
}

/** Rows built per animation frame while rendering a review result; keeps each synchronous
 *  chunk short enough that the UI (including "Back") never appears to freeze. */
const RESULT_ROW_BATCH_SIZE = 500;

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function formatState(state: MissionState): string {
  return state.toLowerCase().replaceAll('_', ' ');
}

function toLocalInputValue(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' })[char] ?? char);
}

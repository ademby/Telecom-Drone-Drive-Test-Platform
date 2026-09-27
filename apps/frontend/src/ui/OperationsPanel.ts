import type { Mission } from '@drone-drive/contracts/mission';
import type { MissionResult } from '@drone-drive/contracts/mission-result';
import type { MissionEditorMode } from '../workflows/mission/MissionEditor.js';
import {
  MissionOperationsView,
  type MissionFormData,
  type MissionOperationsViewCallbacks,
} from '../workflows/mission/MissionOperationsView.js';
import {
  HeatmapOperationsView,
  type HeatmapOperationsViewCallbacks,
} from '../workflows/heatmap/HeatmapOperationsView.js';
import type { SignalQualityPalette } from '../workflows/heatmap/SignalQualityPalette.js';
import type { PanelView } from './PanelView.js';
import { panelShellTemplate } from './OperationsPanelTemplate.js';

/** The only view this panel builds itself; every other view (including the
 *  mission flow's missions/editor/review) is workflow-owned and arrives via
 *  {@link OperationsPanel.registerView}. */
type BuiltinPanelView = 'home';

export default class OperationsPanel {
  readonly element: HTMLElement;
  private readonly homeElement: HTMLElement;
  private readonly panelBody: HTMLElement;
  private readonly panelGroups: HTMLElement;
  private readonly viewTitle: HTMLElement;
  /** Views registered by workflows via {@link registerView}, keyed by their id.
   *  See docs/adr/0005-workflow-owned-map-surface-and-ui.md. */
  private readonly registeredViews = new Map<string, PanelView>();
  private readonly missionView: MissionOperationsView;
  private readonly heatmapView: HeatmapOperationsView;

  constructor(
    missionCallbacks: MissionOperationsViewCallbacks,
    heatmapCallbacks: HeatmapOperationsViewCallbacks,
    initialPalette: SignalQualityPalette,
  ) {
    this.element = document.createElement('aside');
    this.element.className = 'operations-panel mission-panel';
    this.element.innerHTML = panelShellTemplate;

    document.body.appendChild(this.element);
    this.panelBody = this.element.querySelector('.panel-body') as HTMLElement;
    this.panelGroups = this.element.querySelector('.panel-groups') as HTMLElement;
    this.viewTitle = this.element.querySelector('.panel-title') as HTMLElement;
    this.homeElement = this.element.querySelector('.panel-home') as HTMLElement;

    this.missionView = new MissionOperationsView(missionCallbacks);
    this.missionView.panelViews.forEach((view) => this.registerView(view));
    this.heatmapView = new HeatmapOperationsView(initialPalette, heatmapCallbacks);
    this.registerView(this.heatmapView.panelView);

    this.element.querySelector('.panel-reopen')?.addEventListener('click', () => this.element.classList.remove('retracted'));
    this.element.querySelector('.collapse-panel')?.addEventListener('click', () => this.element.classList.add('retracted'));
    this.element.querySelector('.close-panel')?.addEventListener('click', () => this.hidePanel());
  }

  /**
   * Inserts a workflow-owned {@link PanelView}: appends its section to
   * `.panel-body`, appends its optional nav card to the home screen's
   * `.panel-groups` and wires it to `showView`, and — unless the view opts
   * out via `autoWireBackButton: false` because it already wires its own
   * `.back-button` to workflow-specific cleanup — wires any `.back-button`
   * inside the section to return to `'home'`. Safe to call once per view id.
   */
  registerView(view: PanelView): void {
    if (this.registeredViews.has(view.id)) return;
    this.registeredViews.set(view.id, view);
    this.panelBody.appendChild(view.sectionElement);
    if (view.navCardElement) {
      this.panelGroups.appendChild(view.navCardElement);
      view.navCardElement.querySelector('.panel-nav-card')
        ?.addEventListener('click', () => this.showView(view.id));
    }
    if (view.autoWireBackButton !== false) {
      view.sectionElement.querySelectorAll('.back-button')
        .forEach((button) => button.addEventListener('click', () => this.showView('home')));
    }
  }

  renderMissions(missions: readonly Mission[], selectedId: string | null): void {
    this.missionView.renderMissions(missions, selectedId);
  }

  setEditor(mission: Mission | null, title: string): void {
    this.missionView.setEditor(mission, title);
    this.showView('editor');
  }

  showReview(mission: Mission): void {
    this.missionView.showReview(mission);
    this.showView('review');
  }

  setResult(result: MissionResult | null): void {
    this.missionView.setResult(result);
  }

  setMeasurementSelection(ids: readonly string[]): void {
    this.missionView.setMeasurementSelection(ids);
  }

  setMeasurementRejection(rejectedIds: readonly string[]): void {
    this.missionView.setMeasurementRejection(rejectedIds);
  }

  setResultStatusMessage(message: string): void {
    this.missionView.setResultStatusMessage(message);
  }

  setSignalQualityToggleState(visible: boolean): void {
    this.heatmapView.setToggleState(visible);
  }

  setActiveTool(mode: MissionEditorMode): void {
    this.missionView.setActiveTool(mode);
  }

  showMissionList(): void { this.showView('missions'); }
  showHome(): void { this.showView('home'); }

  getFormData(): MissionFormData { return this.missionView.getFormData(); }

  showPanel(): void {
    this.element.classList.remove('hidden', 'retracted');
  }

  hidePanel(): void {
    this.element.classList.add('hidden');
  }

  private showView(id: string): void {
    const builtinTitles: Record<BuiltinPanelView, string> = { home: 'Operations' };
    this.homeElement.classList.toggle('hidden', id !== 'home');
    for (const registered of this.registeredViews.values()) {
      registered.sectionElement.classList.toggle('hidden', registered.id !== id);
    }
    this.viewTitle.textContent = (builtinTitles as Record<string, string>)[id]
      ?? this.registeredViews.get(id)?.title
      ?? id;
  }
}

export { OperationsPanel };

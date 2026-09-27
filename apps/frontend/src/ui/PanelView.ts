/**
 * A workflow-owned section of the operations panel.
 *
 * Per docs/adr/0005-workflow-owned-map-surface-and-ui.md, panel sections are
 * supplied by workflows, not the other way around: a workflow's own
 * `*OperationsView` builds both elements below and hands them to
 * `OperationsPanel.registerView`, which only knows how to insert and switch
 * between views — it does not know any workflow's markup.
 */
export interface PanelView {
  /** Stable id used by `OperationsPanel.showView(id)` and internal bookkeeping. */
  readonly id: string;
  /** Shown in the panel header (`.panel-title`) while this view is active. */
  readonly title: string;
  /** The `.panel-view` section appended to `.panel-body`, hidden until shown. */
  readonly sectionElement: HTMLElement;
  /**
   * Optional `.panel-group` card appended to the home screen's `.panel-groups`
   * so the operator can navigate into this view. Omit for views (like the
   * mission editor/review sub-views) that are only reached from another view.
   */
  readonly navCardElement?: HTMLElement;
  /**
   * Whether `registerView` should auto-wire this section's `.back-button` to
   * return to the home screen. Defaults to `true`. Set to `false` when the
   * view already wires its own `.back-button` to workflow-specific cleanup
   * (e.g. mission editor/review's back button also stops in-progress editing
   * via `MissionWorkflow.back()`, not just a panel navigation change).
   */
  readonly autoWireBackButton?: boolean;
}

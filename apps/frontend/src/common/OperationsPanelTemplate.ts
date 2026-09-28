/**
 * Markup for `OperationsPanel`'s own shell: the header chrome and the empty
 * home screen. Kept separate from OperationsPanel.ts so that file's logic
 * isn't interleaved with long HTML strings. Every workflow view — including
 * the mission flow's missions/editor/review sections — builds its own markup
 * in its `*OperationsView` (see e.g. workflows/mission/MissionOperationsViewTemplate.ts)
 * and hands it to `OperationsPanel.registerView`; this file owns nothing
 * workflow-specific. See docs/adr/0005-workflow-owned-map-surface-and-ui.md.
 */

/*html*/
export const panelShellTemplate = `
  <div class="panel-header">
    <div><span class="panel-kicker">Drone Drive Test</span><h2 class="panel-title">Operations</h2></div>
    <div class="panel-header-actions">
      <button class="icon-button collapse-panel" type="button" aria-label="Retract panel">−</button>
      <button class="icon-button close-panel" type="button" aria-label="Hide panel">×</button>
    </div>
  </div>
  <div class="panel-body">
    <section class="panel-view panel-home">
      <p class="panel-intro">Choose an operations workspace.</p>
      <div class="panel-groups"></div>
    </section>
  </div>
  <button class="panel-reopen" type="button" aria-label="Expand operations panel">Operations</button>`;

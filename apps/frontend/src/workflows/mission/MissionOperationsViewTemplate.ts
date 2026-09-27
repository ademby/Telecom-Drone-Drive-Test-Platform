/*html*/
export const missionsNavCardTemplate = `
  <h3>Missions</h3>
  <button class="panel-nav-card missions-nav" type="button"><strong>Mission control</strong><span>Create, edit, and review flight plans</span></button>`;

/*html*/
export const missionsSectionTemplate = `
  <div class="view-toolbar"><button class="back-button" type="button">← Overview</button><span class="view-status">Mission register</span></div>
  <div class="mission-actions"><button class="primary new-mission" type="button">New mission</button></div>
  <div class="mission-list"></div>`;

/*html*/
export const missionEditorSectionTemplate = `
  <div class="view-toolbar"><button class="back-button" type="button">← Missions</button><span class="view-status">Mission editor</span></div>
  <div class="mission-editor">
    <div class="editor-heading"><h3>Mission details</h3></div>
    <label>Name<input name="name" type="text" placeholder="Mission name"></label>
    <label>Earliest start<input name="start" type="datetime-local"></label>
    <label>Dispatch deadline (optional)<input name="deadline" type="datetime-local"></label>
    <label>Assigned drone<select name="drone">
      <option value="drone-alpha">Drone Alpha</option>
      <option value="drone-bravo">Drone Bravo</option>
    </select></label>
    <div class="editor-tools">
      <button type="button" data-tool="draw">Create path</button>
      <button type="button" data-tool="modify">Modify</button>
      <button type="button" data-tool="translate">Translate</button>
      <button type="button" data-tool="undo">Undo</button>
      <button type="button" data-tool="redo">Redo</button>
    </div>
    <div class="editor-actions">
      <button class="secondary cancel" type="button">Back</button>
      <button class="danger cancel-mission hidden" type="button">Cancel mission</button>
      <button class="secondary retry-mission hidden" type="button">Retry as new mission</button>
      <button class="secondary plan" type="button">Plan mission</button>
      <button class="primary save" type="button">Save draft</button>
    </div>
  </div>`;

/*html*/
export const missionReviewSectionTemplate = `
  <div class="view-toolbar"><button class="back-button" type="button">← Missions</button><span class="view-status">Mission validation</span></div>
  <div class="mission-editor result-section">
    <div class="editor-heading review-heading">
      <h3 class="review-mission-name"></h3>
      <span class="review-state-badge"></span>
    </div>
    <p class="result-loading hidden">Loading result…</p>
    <p class="result-empty hidden">No result uploaded yet.</p>
    <p class="result-hint">Click a point to select it, shift-click to extend, Ctrl/Cmd-drag on the map to box-select.</p>
    <div class="result-toolbar hidden">
      <button class="secondary select-all-measurements" type="button">Select all</button>
      <button class="secondary invert-measurement-selection" type="button">Invert</button>
      <button class="secondary clear-measurement-selection" type="button">Clear</button>
      <button class="primary approve-selected-measurements" type="button">Approve selected</button>
      <button class="danger reject-selected-measurements" type="button">Reject selected</button>
    </div>
    <p class="selection-summary"></p>
    <ul class="result-measurements"></ul>
    <div class="result-actions">
      <button class="secondary save-review" type="button">Save review</button>
      <button class="primary finalize-review" type="button">Finalize revision</button>
    </div>
    <p class="result-status"></p>
  </div>`;

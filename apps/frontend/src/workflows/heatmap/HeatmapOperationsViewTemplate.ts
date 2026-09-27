import type { SignalQualityPaletteStop } from './SignalQualityPalette.js';

/*html*/
export const heatmapNavCardTemplate = `
  <h3>Signal quality</h3>
  <button class="panel-nav-card heatmap-nav" type="button"><strong>Signal quality</strong><span>Show coverage strength on the map</span></button>`;

/*html*/
export const heatmapSectionTemplate = `
  <div class="view-toolbar"><button class="back-button" type="button">← Overview</button><span class="view-status">Coverage layer</span></div>
  <div class="feature-view">
    <h3>Signal quality</h3>
    <p>Compare coverage strength with the active map context.</p>
    <button class="primary toggle-kpi" type="button">Show signal quality</button>
    <button class="secondary refresh-kpi" type="button" title="Reload coverage data (measurements reviewed elsewhere aren't picked up automatically)">Refresh data</button>
    <div class="palette-editor">
      <div class="palette-editor-header"><h4>Color palette</h4><button class="secondary palette-reset" type="button">Reset</button></div>
      <div class="palette-stops"></div>
      <button class="secondary palette-add-stop" type="button">Add stop</button>
    </div>
  </div>`;

export function paletteStopRowTemplate(stop: SignalQualityPaletteStop): string {
  /*html*/
  return `
    <input type="color" class="palette-color" value="${stop.color}">
    <input type="number" class="palette-offset" min="0" max="1" step="0.05" value="${stop.offset}">
    <button type="button" class="icon-button palette-remove" aria-label="Remove stop">×</button>`;
}

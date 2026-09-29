# Workflows own their map layers and UI; MapController stays thin

**Status:** Accepted. Extended by ADR-0009 (workflow independence) and ADR-0010 (panel host). The composition-root wording below was superseded by ADR-0009.

## Context

Previously each workflow received a bespoke `*MapWorkspace` interface (for example `NavigationMapWorkspace`, `HeatmapMapWorkspace`) through which `MapController` exposed one setter per concern (`setContext`, `setMission`, `setKpiPalette`, ...). Every new workflow concept meant widening `MapController` again, and each pass-through interface had exactly one adapter, never a real seam.

## Decision

Each workflow (`NavigationWorkflow`, `MissionWorkflow`, `HeatmapWorkflow`) receives a direct reference to `MapController` at construction. Each workflow builds and registers its own `LayerGroup` (`mapController.map.addLayer/addInteraction/addControl`) and its own UI controls (`Breadcrumbs`, `LocationSearch`, `SignalQualityLegend`, its operations-panel views), instead of `CompositionRoot` assembling them piecemeal.

`MapController`'s interface shrinks to the OpenLayers `Map`, basemap switching (it also registers its own control), and the view-animation helpers that are genuinely shared (`fitViewToFeature`, `fitViewToFeatureHop`, `hopToView`, `fitViewToExtent`, `getProjection`, `getViewState`).

## Considered options

- **Keep and grow the `*MapWorkspace` pattern.** Rejected: keeps `MapController` widening indefinitely as workflows grow.
- **A formal `LayerGroup` registry owned by `MapController`.** Rejected: still centralizes construction that is workflow-local and does not reduce `MapController`'s interface growth.

## Consequences

`OperationsPanel` becomes a generic view host (`registerView(view)`, ADR-0010) because panel sections are supplied by workflows. Layer stacking is coordinated by convention through z-indexes (see `architecture/frontend.md` section 5). Each workflow scopes its own interactions to its own layers.

## Amendments

- 2026-09: the original text said `CompositionRoot` would "build `MapController` and data APIs, then construct each workflow". In the code, `CompositionRoot` builds the map controller, the admin dataset and the operations panel, and each workflow constructs its **own** HTTP adapters and renderer. Superseded by ADR-0009. Tradeoffs are in `architecture/frontend.md` (C-3).

# Workflows own their map layers and UI; MapController stays thin

Previously each workflow received a bespoke `*MapWorkspace` interface (e.g. `NavigationMapWorkspace`, `HeatmapMapWorkspace`) through which `MapController` exposed one setter per concern (`setContext`, `setMission`, `setKpiPalette`, ...). Every new workflow concept meant widening `MapController` again, and each pass-through interface had exactly one adapter — never a real seam.

We now give each workflow (`NavigationWorkflow`, `MissionWorkflow`, `HeatmapWorkflow`) a direct reference to `MapController` at construction. Each workflow builds and registers its own `LayerGroup` (`mapController.map.addLayer/addInteraction`) and its own UI controls (`Breadcrumbs`, `LocationSearch`, `SignalQualityLegend`, its `OperationsPanel` view) directly, instead of `CompositionRoot` assembling them piecemeal. `MapController`'s interface shrinks to the OL `Map`, basemap switching (which it also self-registers a control for), and the view-animation helpers (`fitViewToFeature`, `hopToView`, `fitViewToExtent`) that are genuinely shared across workflows.

## Considered options

- **Keep and grow the `*MapWorkspace` pattern.** Rejected: keeps `MapController` shallow-widening indefinitely as workflows grow.
- **A formal `LayerGroup` registry owned by `MapController`.** Rejected: still centralizes construction that is workflow-local; doesn't reduce `MapController`'s interface growth.

## Consequences

`OperationsPanel` becomes a generic view-registration host (`registerView(view)`) rather than importing and typing each workflow's view directly, since panel sections are now supplied by workflows, not the other way around. `CompositionRoot` shrinks to: build `MapController` and data APIs, then construct each workflow with those, in dependency order.

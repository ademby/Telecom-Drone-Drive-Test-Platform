# Frontend architecture

Scope: `apps/frontend` (Vite + TypeScript + OpenLayers 10). Status: describes the code after the refactor series `refactor 1` to `refactor 5`. Before that refactor the UI logic lived in a few large constructors and central classes (`MapController`, `OperationsPanel`, `CompositionRoot`); responsibilities are now split per feature.

Diagrams referenced below live in [`../uml/`](../uml/) (PlantUML) and [`../architecture-diagrams.md`](../architecture-diagrams.md) (Mermaid).

---

## 1. Design in one paragraph

The UI is a full-screen OpenLayers map with a floating **operations panel**. Every operator capability is a **workflow**: `NavigationWorkflow` (administrative geography), `MissionWorkflow` (planning and result review) and `HeatmapWorkflow` (Signal Quality surface). A workflow owns everything it needs: its map layers, its map interactions and controls, its panel sections, and (for the two backend-facing workflows) its HTTP adapters. Workflows do **not** call each other. What they share is deliberately small: the `MapController` (map instance, basemap, view-animation helpers) and the `OperationsPanel` (a generic host that inserts views it is given). A `CompositionRoot` builds the shared pieces once and wires the workflows in dependency order.

## 2. Source layout

```text
apps/frontend/src/
├── main.ts                        entry: CompositionRoot.create(), dev-only globalThis.compositionRoot
├── ui.config.ts                   build-time rendering defaults (renderer kind, tile size, opacity, caches)
├── style.css, typings.d.ts
├── common/
│   ├── CompositionRoot.ts         builds MapController + AdminDataset, panel, three workflows; initial loads
│   ├── OperationsPanel.ts         generic panel shell + registerView / showView
│   ├── OperationsPanelTemplate.ts shell markup only (header + empty home)
│   └── PanelView.ts               contract a workflow uses to contribute a panel section
├── map/
│   ├── MapController.ts           ol/Map, basemap, view helpers (fit, hop, extent, projection, view state)
│   ├── BasemapManager.ts, BasemapControl.ts, Esri.ts
│   └── styles.ts                  shared OL styles (admin, mission route, measurement points)
└── workflows/
    ├── navigation/                administrative geography
    ├── mission/                   mission planning + result review
    └── heatmap/                   Signal Quality surface
```

Shared wire types come from `packages/contracts` (`@drone-drive/contracts/mission`, `/mission-result`, `/signal-quality`), which the frontend imports as TypeScript source.

## 3. Principles

1. **Feature ownership.** A feature adds layers, interactions, controls and panel sections itself. Nothing central grows when a feature grows (ADR-0005, ADR-0009).
2. **No workflow-to-workflow calls.** Cross-feature "something changed" signals must not be direct calls. Today the operator is told to refresh the heatmap by an advisory; the planned mechanism is a single SSE channel dispatched by receiver (ADR-0011, `future-features.md`).
3. **Thin shared surface.** `MapController` exposes only what several workflows genuinely share. `OperationsPanel` knows the `PanelView` contract and nothing about any workflow's markup (ADR-0010).
4. **Backend authority, numeric data.** The backend owns state and produces numeric tiles; palette, thresholds and opacity are client-side (ADR-0004).
5. **Explicit seams only where there are two implementations.** The one real seam is `SignalQualityRenderer` (Canvas default, WebGL retained; ADR-0006). Http adapters implement the interfaces in `packages/contracts`.
6. **Static, build-time product defaults.** Rendering knobs live in `ui.config.ts`; only infrastructure (`VITE_API_BASE_URL`) is environment.

## 4. Building blocks

### 4.1 CompositionRoot (`common/CompositionRoot.ts`)

`CompositionRoot.create()`:

1. `new MapController()` (targets `#map-container`).
2. `AdminDatasetLoader.loadDataset({ featureProjection })` (fetches `/data/boundaries.geojson`, builds the `AdminTree`; fails unless there is exactly one ADM0 root).
3. Constructor, in this order: `OperationsPanel`, `NavigationWorkflow`, `HeatmapWorkflow`, `MissionWorkflow`. The order of construction is the order panel cards appear on the home screen (Signal quality, then Missions).
4. `navigationWorkflow.showInitialRoot()`, then fire-and-forget `missionWorkflow.load()` and `heatmapWorkflow.load()`.

It builds **no** feature layers and **no** HTTP adapters. (ADR-0005 originally said the root would also build the data APIs; workflows now construct their own, see 8.) In Vite dev mode `main.ts` exposes the instance as `globalThis.compositionRoot`.

### 4.2 MapController (`map/MapController.ts`)

Owns the `ol/Map`, the `BasemapManager` (five basemaps, one visible, switched by `BasemapControl`) and the view helpers used by more than one workflow: `fitViewToFeature`, `fitViewToFeatureHop`, `hopToView`, `fitViewToExtent`, `getProjection`, `getViewState`. Workflows use `mapController.map` directly to add layers, interactions and controls. It holds no reference to any workflow.

### 4.3 OperationsPanel and PanelView (`common/`)

`OperationsPanel` builds only the shell and a `home` screen. A workflow contributes UI by registering a `PanelView`:

| Field | Meaning |
| ----- | ------- |
| `id` | key for `showView(id)` |
| `title` | header text while the view is active |
| `sectionElement` | the `.panel-view` section, appended to `.panel-body`, hidden until shown |
| `navCardElement?` | card appended to the home screen; clicking it calls `showView(id)` |
| `autoWireBackButton?` | default `true`: any `.back-button` inside returns to home. `false` when the view wires its own back behavior (editor, review) |

Registered ids: `heatmap` (HeatmapWorkflow); `missions`, `editor`, `review` (MissionWorkflow). Only `missions` and `heatmap` have home cards. Workflows switch views by these string ids, which is an implicit contract between a workflow and its own view.

### 4.4 NavigationWorkflow (`workflows/navigation/`)

Purpose: browse the administrative hierarchy and move the map to a region.

- **Owns**: four vector sources and layers in one `LayerGroup` (context z10, active z20, selection z30, hover z40), a click `Select` interaction scoped to the active layer, a `Breadcrumbs` control (an `LocationDisplay` subclass) and a `LocationSearch` control, plus the `NavigationState` (`selected`, `path`, `active`, `context`).
- **Data**: `AdminDatasetLoader` produces an `AdminDataset` (`features`, `AdminTree`, lookup by feature and by id). `AdminNode` carries `id`, `level`, `feature`, `parent`, `children`. `AdminTree` provides `pathTo`, `siblingsOf`, `allNodes`.
- **Selecting a node** (`selectNode`): computes the path, the *active* set (children of the node plus siblings of every path node), refreshes the sources, then either fits the view (`fitViewToFeature`) or performs a hop (`fitViewToFeatureHop`), depending on `shouldUseDefaultTransition` (plain fit when going to the root or between ancestor and descendant, hop otherwise), and updates the breadcrumbs.
- **Preview and commit** (used by search): `previewNode` captures one `NavigationSnapshot` (state plus map center and zoom) the first time and then selects the node; `restorePreview` puts everything back and hops to the saved view; `commitPreview` drops the snapshot and keeps the previewed selection.
- **Search**: `LocationSearch` is a self-contained control. It receives a pre-built option list (label plus `A / B / C` path) and four callbacks (`onPreviewStart`, `onPreviewEnd`, `onPreviewCommit`, `onSelect`). Ranking is in `locationSearchRanking.ts` (minimum 2 characters; exact label 100, prefix 80, contains 60, path contains 30; top 12). There is no debounce on typing; the 350 ms delay applies to *starting a preview* when the pointer rests on, or the arrow keys land on, an option. See `uml/0008`.

### 4.5 MissionWorkflow (`workflows/mission/`)

Purpose: plan missions and review uploaded results. It is the largest workflow.

- **Owns**: a `LayerGroup` with the route layer (z50) and the measurement layer (z55); `MissionEditor`; `MeasurementReviewController`; `MissionOperationsView`; `HttpMissionApi`; `HttpMissionResultApi`; and the state `missions`, `selectedMissionId`, `editingMissionId`.
- **MissionEditor**: encapsulates the route-editing interactions (`Draw`, `Modify`, `Translate`, `Snap`), a 50-step undo/redo stack of GeoJSON geometries, and the WGS84 <-> map-projection conversion (`getGeometry()` returns GeoJSON `LineString`, 7 decimals). It reports mode changes (`idle`, `draw`, `modify`, `translate`) through a callback.
- **MeasurementReviewController**: renders a `MissionResult`'s measurements as point features colored by Signal Quality, built in batches of 500 per animation frame so large results do not freeze the UI (a load token aborts a stale load). It owns click, shift-click and Ctrl/Cmd-drag selection, `selectAll`, `invertSelection`, `clearSelection`, `approveSelected`, `rejectSelected`. The reject set is **local** until the operator saves.
- **MissionOperationsView**: builds three panel views (`missions` list with a home card, `editor`, `review`), reads form data and renders lists. It calls workflow methods for every command.
- **Command flow**: `create`, `select`, `save` (create or `updateDraft`), `plan`, `cancelMission`, `retry` (derive from failure), `cancel` (leave editing), `back`, `saveReview`. Mutating calls send an `Idempotency-Key` (`plan-<id>`, `cancel-<id>`, `derive-<id>`, `review-<id>-<timestamp>`).
- **Selecting a mission**: `COMPLETED` and `FAILED` missions open the `review` view and load the result; every other state opens the `editor`. A missing result (typical for `FAILED`) shows the empty state.
- **After finalize**: `saveReview(..., true)` shows a fading advisory on the map ("Refresh the heatmap ..."). It does not call the heatmap workflow (ADR-0011).
- **Errors**: `save`, `plan`, `cancelMission` and `retry` report failures with `window.alert`; review failures are shown in the review view's status line.

### 4.6 HeatmapWorkflow (`workflows/heatmap/`)

Purpose: explore the approved Signal Quality surface.

- **Owns**: visibility, the current palette, `dataLoaded`, the `HttpSignalQualityApi`, the renderer, the legend control and the `HeatmapOperationsView`.
- **Operations**: `load()` (fetch range and version, apply to renderer and legend, start hidden), `refresh()` (re-fetch range and version; a new version invalidates the numeric tile cache), `toggle()` (loads first if needed), `setPalette()` (validated by `isValidPalette`; pushes to renderer and legend), `resetPalette()`.
- **Does not** fetch tiles (the tile source does, through `SignalQualityApi.getTile`) and does not listen to any other workflow.
- **SignalQualityRenderer** (interface in `SignalQualityRenderer.ts`): `layer`, `setRange`, `setPalette`, `setVisible`, `dispose`. `HttpSignalQualityRenderer` picks the implementation once from `uiConfig.kpiRenderer`:
  - `canvas` (default): `SignalQualityTileSource` (an OL `ImageTileSource`) fetches numeric 64x64 tiles, keeps a version-keyed LRU of `Float32Array`s (512 entries), and asks a module worker to colorize them through a 1024-entry palette lookup table (NaN cells transparent, fixed per-pixel alpha). The OL tile key combines the data version and a *presentation generation*, so a palette or range change re-colorizes from cache with no network traffic.
  - `webgl` (retained, not operator-ready): `SignalQualityTileSource_ForWebGL` (an OL `DataTileSource`) with a WebGL style built from palette, min and max.
- **SignalQualityPalette**: presentation-only color ramp, validation, CSS gradient, worker stops, and `colorMeasurementsBySignalQuality` (also used by mission review, see 9).

## 5. Map layer stack

| Order (z) | Layer | Owner |
| --------- | ----- | ----- |
| basemap | one of five, exactly one visible | MapController |
| 10 | admin context (selected path) | NavigationWorkflow |
| 20 | admin active (clickable regions) | NavigationWorkflow |
| 30 | admin selection | NavigationWorkflow |
| 40 | admin hover (created, never populated) | NavigationWorkflow |
| 45 | Signal Quality tiles | HeatmapWorkflow |
| 50 | mission route | MissionWorkflow |
| 55 | measurement points | MissionWorkflow |

Interactions are scoped by layer (for example, the navigation `Select` only targets the active layer and the measurement `Select` only targets the measurement layer) so features do not steal each other's clicks. Controls added to the map: basemap switch (MapController), breadcrumbs and location search (Navigation), Signal Quality legend (Heatmap).

## 6. Layering pattern inside a workflow

```text
*Workflow            decisions, state, commands, owns layers/interactions, talks to Api
  ├─ *OperationsView DOM only: builds PanelView(s), reads inputs, renders lists, calls workflow
  ├─ Http*Api        implements a contracts interface, hides URLs/headers/decoding
  └─ helpers         MissionEditor, MeasurementReviewController, SignalQualityRenderer, ...
```

The view and its workflow reference each other (the view invokes commands; the workflow pushes state to the view). The workflow is the single owner of state.

## 7. Configuration

| What | Where | Notes |
| ---- | ----- | ----- |
| `VITE_API_BASE_URL` | `apps/frontend/.env` | required; adapters throw at construction if it is missing |
| `kpiRenderer` | `ui.config.ts` | `"canvas"` or `"webgl"`, build time |
| `workerPoolSize` | `ui.config.ts` | reserved seam, currently `1`; **not read by any code yet** |
| `tileSize`, `maxZoom`, `layerOpacity`, `tilePixelAlpha` | `ui.config.ts` | tile presentation |
| `maxNumericTileCache`, `layerCacheSize` | `ui.config.ts` | client caches |
| Grid size | `SIGNAL_QUALITY_GRID_SIZE` in `packages/contracts` | shared with the backend (64) |
| Default palette | `SignalQualityPalette.ts` | black, red, purple, blue, cyan, white |
| Admin data | `apps/frontend/public/data/` | generated by `tools/data-pipeline`, git-ignored |

## 8. Backend interaction

| Adapter | Interface | Endpoints |
| ------- | --------- | --------- |
| `HttpMissionApi` | `MissionApi` | `GET/POST /missions`, `GET/PATCH /missions/:id`, `POST /missions/:id/plan\|cancel\|derive` |
| `HttpMissionResultApi` | `MissionResultApi` | `GET/POST /missions/:id/result`, `POST /missions/:id/result/revisions`, `GET /missions/:id/result/approved-measurements` |
| `HttpSignalQualityApi` | `SignalQualityApi` | `GET /signal-quality/range`, `GET /signal-quality/tiles/:z/:x/:y?v=<version>` |

The browser never calls the drone endpoints (`claim`, `status`) and, in practice, never calls result `upload`.

## 9. Known coupling and technical debt

These are observations from reading the code, kept here so they are decided rather than rediscovered. None of them was verified by running the application.

| # | Observation | Suggested direction |
| - | ----------- | ------------------- |
| C-1 | `MeasurementReviewController` and `MissionOperationsView` import palette code from `workflows/heatmap/` (`colorMeasurementsBySignalQuality`, default palette). This is the only workflow-to-workflow module import. | Move `SignalQualityPalette` to a shared presentation module (for example `common/` or `kpi/`). |
| C-2 | `MeasurementReviewController` holds a back-reference to `MissionWorkflow` (type and callbacks), a cycle between a workflow and its helper. `MissionOperationsView` also depends on the concrete workflow. | Pass narrow callback objects or the already-declared `MissionWorkflowView` style interface instead of the concrete class. |
| C-3 | Workflows construct their own `Http*Api` and renderer. Only the real HTTP adapters exist, so substitution is not possible without editing the workflow. | Accept `MissionApi`, `MissionResultApi`, `SignalQualityApi` through the options object, defaulting to the HTTP adapters. |
| C-4 | `requireApiBaseUrl()` is copy-pasted in three adapters. | Single shared helper. |
| C-5 | `MissionWorkflow.saveReview` renders DOM (`showFadingAdvisory`). | Move to a small shared notification helper owned by the panel or `common/`. |
| C-6 | `MissionEditor`'s `drawend` handler disables interactions but does not report `idle`, so the active-tool highlight and cursor class may remain on `draw`. | Call `onModeChange('idle')` on `drawend`. |
| C-7 | Startup `missionWorkflow.load()` and `heatmapWorkflow.load()` are `void` promises; a failure is an unhandled rejection rather than the startup banner. Heatmap toggle and refresh errors are not shown to the operator either. | Catch and surface. |
| C-8 | Drones offered in the editor are hard-coded (`drone-alpha`, `drone-bravo`) in the template and in `create()`. | Source from a backend endpoint once drones become an entity. |
| C-9 | `missionStyle` reads `feature.get("status") === "ACCOMPLISHED"`, a prototype leftover: features built by `MissionEditor` never set `status`, so routes always draw red and dashed. | Style by `MissionState`. |
| C-10 | Dead or unused code: `NavigationWorkflow.setSelectionEnabled`, the hover layer and source, `MissionWorkflowView` interface, `DEFAULT_SIGNAL_QUALITY_PALETTE_2`, `OperationsPanel.showPanel` (so once hidden the panel cannot be reopened from the UI), `uiConfig.workerPoolSize`, `renderer.dispose()` never called. `NavigationSearchOption` duplicates `LocationSearchOption`. | Delete or wire up. |
| C-11 | `map/styles.ts` is a shared file containing styles for three workflows. | Split per workflow if it keeps growing. |
| C-12 | Several source comments are stale (`CompositionRoot` says it builds Apis; `MissionWorkflow.review` says "exposed for OperationsPanel"). | Update comments. |

## 10. Extending

**Add a workflow** (for example live drone positions):

1. Create `workflows/<name>/` with `<Name>Workflow`, an `<Name>OperationsView` if it needs panel UI, and an `Http<Name>Api` if it talks to the backend.
2. In the workflow constructor add its own `LayerGroup`, interactions, controls and `operationsPanel.registerView(...)`.
3. Construct it in `CompositionRoot` after the things it depends on. Do not import or call another workflow. For cross-feature notifications use the future SSE dispatch (ADR-0011).

**Add a second KPI**: copy the pattern (Api + Renderer + Workflow) first; only extract a shared `Kpi*` layer once two KPIs prove what is common (ADR-0008, `future-features.md`).

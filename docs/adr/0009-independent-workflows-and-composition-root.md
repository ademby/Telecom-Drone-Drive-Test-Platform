# Independent workflows wired by a composition root

**Status:** Accepted (records the outcome of the frontend refactor, commits `refactor 1` to `refactor 5`). Supersedes the composition-root wording of ADR-0005.

## Context

Before the refactor the UI logic lived in a few large constructors and central classes. `CompositionRoot`, `MapController` and `OperationsPanel` knew about every feature: adding a capability meant editing all three, and features could reach into each other through those central objects. Cross-feature coupling was invisible.

## Decision

The frontend is a set of **workflows**, each a self-contained operator capability:

| Workflow | Owns |
| -------- | ---- |
| `NavigationWorkflow` | admin layers, click `Select`, `Breadcrumbs`, `LocationSearch`, navigation state, preview/commit |
| `MissionWorkflow` | route and measurement layers, `MissionEditor`, `MeasurementReviewController`, `MissionOperationsView` (3 panel views), `HttpMissionApi`, `HttpMissionResultApi` |
| `HeatmapWorkflow` | Signal Quality layer and legend, palette, range/version, `HeatmapOperationsView`, `HttpSignalQualityApi`, renderer |

Rules:

1. **A workflow never calls another workflow.** It may use only the shared `MapController`, the shared `OperationsPanel`, `packages/contracts`, and its own collaborators.
2. **A workflow contributes to shared surfaces by adding to them** (`map.addLayer/addInteraction/addControl`, `operationsPanel.registerView`), never by extending them.
3. **`CompositionRoot` is the only place that knows all workflows.** It creates the map controller, loads the admin dataset, creates the operations panel, constructs the workflows in dependency order, and triggers the initial loads. It builds no feature layers and no HTTP adapters.
4. **Each workflow is layered internally**: workflow (state, commands, map ownership) -> operations view (DOM only) -> Http adapter (contracts interface) -> helpers.

## Considered options

- **One central `App` object mediating workflows (mediator).** Rejected: recreates the central class the refactor removed.
- **Workflows subscribe to a shared in-browser event bus.** Rejected for now: the only real cross-workflow need is "results were finalized, refresh the heatmap", which ADR-0011 handles without a bus.
- **Inject the HTTP adapters from the composition root.** Considered and not done; workflows construct their own adapters (see Consequences).

## Consequences

- Adding a workflow does not modify existing workflows, the map controller or the panel.
- Testing a workflow needs a map and a panel but no other workflow.
- **Known deviations, tracked in `architecture/frontend.md`:**
  - the mission workflow imports palette code from the heatmap folder (C-1);
  - `MeasurementReviewController` and `MissionOperationsView` hold references to the concrete `MissionWorkflow` (C-2);
  - adapters are constructed inside workflows, so they cannot be substituted without editing them (C-3).
- Panel card order is the construction order in `CompositionRoot`.

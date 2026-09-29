# OperationsPanel is a generic view host

**Status:** Accepted

## Context

`OperationsPanel` used to build the markup for every feature's section (heatmap controls, mission list, editor, review) and expose feature-specific methods. Every new workflow forced a change to it, and the panel depended on every workflow's DOM.

## Decision

`OperationsPanel` builds only the shell (header, back handling, empty home screen) and hosts **views supplied by workflows** through the `PanelView` contract:

```ts
interface PanelView {
  id: string;                    // key for showView(id)
  title: string;                 // header text while active
  sectionElement: HTMLElement;   // .panel-view section, hidden until shown
  navCardElement?: HTMLElement;  // optional home-screen card, opens the view
  autoWireBackButton?: boolean;  // default true: .back-button returns home
}
```

API: `registerView(view)`, `showView(id)`, `showHome()`, `showPanel()`, `hidePanel()`. Registered views today: `heatmap`; `missions`, `editor`, `review`. Only `heatmap` and `missions` have home cards; `editor` and `review` are reached from within the mission workflow and set `autoWireBackButton: false` because the workflow decides where back goes.

## Consequences

- A workflow adds UI without touching the panel; the panel imports no workflow.
- View ids are plain strings shared between a workflow and its own view (an implicit but local contract).
- The panel does not own any application state; the active view is DOM state.
- `hidePanel()` exists with no UI path to `showPanel()`; either wire a reopen control or delete both (C-10 in `architecture/frontend.md`).

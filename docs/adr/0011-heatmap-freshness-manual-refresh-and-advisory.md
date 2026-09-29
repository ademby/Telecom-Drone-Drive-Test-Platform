# Heatmap freshness: backend invalidation, operator refresh, advisory (SSE later)

**Status:** Accepted as the interim mechanism. The target mechanism (SSE) is recorded in `future-features.md`.

## Context

Finalizing a mission result changes the approved set, so the Signal Quality surface is stale. The mission workflow performs the finalize; the heatmap workflow renders the surface. ADR-0009 forbids the first from calling the second.

## Decision

- **Backend:** finalization emits `ResultRevisionFinalized`; `SignalQualityService` invalidates its points snapshot and tile cache (ADR-0012). The next `GET /signal-quality/range` returns a new `version`, and tile URLs carry `?v=<version>`, so stale tiles are never reused.
- **Frontend:** after a successful finalize the mission workflow shows a **fading advisory** on the map ("Result finalized. Refresh the heatmap to see updated Signal Quality."). The operator presses **Refresh** in the heatmap panel; `HeatmapWorkflow.refresh()` re-reads the range/version, and a new version clears the numeric tile cache so tiles are re-requested.
- No workflow-to-workflow call, no shared in-browser bus.
- **Target:** one SSE connection owned by the composition shell, messages tagged with a `receiver` workflow name, the receiving workflow decides what to do (see `future-features.md`). Nothing of this exists yet.

## Considered options

- **Mission workflow calls `HeatmapWorkflow.refresh()` directly.** Rejected: violates ADR-0009.
- **Frontend event bus.** Rejected: solves one case with a new global mechanism, and would be replaced by SSE.
- **Heatmap polls the range endpoint.** Rejected: wasteful and delays feedback, still not push.

## Consequences

- The heatmap can be stale until the operator refreshes; the advisory makes that visible only immediately after finalize.
- The advisory is only shown on finalize. A finalize done by someone else, or a non-finalizing save that changes the active revision (ADR-0013), gives no notification.
- `MissionWorkflow.saveReview` builds the advisory DOM itself; moving that to a shared notifier is tracked as C-5.
- The backend's own 5-second snapshot TTL and version check mean a stale cache heals even without the event, but the event makes it immediate.

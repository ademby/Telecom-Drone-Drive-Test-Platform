# Future features

Recorded so later work does not re-litigate intent.

**Status (2026-09):** nothing on this page is implemented. The interim mechanism for heatmap freshness is the operator advisory plus manual refresh (ADR-0011).

---

## Platform live events (SSE)

### Intent

Backend is the authority for mission state and projection freshness. The frontend must not couple workflows to each other for “something changed” notifications (e.g. MissionWorkflow must not call HeatmapWorkflow after finalize).

### Mechanism

- **SSE** (server-sent events), one-way server → client.
- Each message includes a **`receiver`** identifying the target workflow, e.g.:
  - `heatmap-workflow`
  - `mission-workflow`
  - (later) a drone / live-position consumer
- The **named workflow** handles the message (re-fetch, re-render, ignore, etc.).

### Example payload shape (illustrative, not final)

```json
{
  "receiver": "heatmap-workflow",
  "type": "projection.invalidated",
  "payload": {
    "kpi": "signal-quality",
    "version": "…"
  }
}
```

### Candidate event types (later)

| Type | Receiver | Purpose |
| ---- | -------- | ------- |
| Projection / Signal Quality version changed | `heatmap-workflow` | Refresh range + abandon stale tiles |
| Mission list or mission state changed | `mission-workflow` | Refresh list or selected mission |
| Drone position update | TBD | Render live pose on the map |

### Frontend ownership (when built)

- One SSE client at **app / composition** shell (single connection).
- Dispatch by `receiver` to the corresponding workflow.
- Workflows do not open their own SSE connections.

### Backend ownership (when built)

- Publish from the same places domain truth changes (e.g. after `ResultRevisionFinalized` and Signal Quality invalidation; mission state transitions). `DomainEvents` (ADR-0012) is the natural hook: add an SSE publisher as another listener.
- Also emit when a non-finalizing save changes the active revision, if ADR-0013 keeps that behavior.
- Do not rely on the HTTP finalize response to drive another workflow’s UI.

### Explicitly not in R-05…R-12

- No SSE endpoint, client, or `receiver` routing in the redesign tickets.
- Interim UX after finalize: **fading advisory** asking the operator to refresh the heatmap (implemented, ADR-0011).

---

## Drone live position on the map

- Depends on the live channel above (or a dedicated stream).
- Rendering belongs to a future workflow or map overlay module — not MapController feature creep in the current redesign.
- `apps/drone-mock` remains the integration stand-in until a real drone feed exists.

---

## Additional KPIs

- A second indicator (e.g. Signal Strength) may justify a shared `Kpi*` naming layer.
- Until then, keep **Signal Quality** as the concrete feature name (ADR-0008).
- Prefer copy-the-pattern (Api + Renderer + workflow) over a speculative multi-KPI framework.

---

## Other notes

- Drone registry and authentication (the editor currently offers two hard-coded drone ids).
- Automated validation policies for mission results (beyond operator-driven review) remain open product decisions.
- Operational area as a mission aggregate is not required by current domain decisions.

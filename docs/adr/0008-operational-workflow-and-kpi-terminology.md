# Route-centric missions, backend-controlled execution, and explicit KPI terminology

**Status:** Accepted. The revision-authority decision is not fully matched by the implementation: see ADR-0013 (Proposed).

## Context

The prototype mixed several concepts that need to be explicit before the domain and interface redesign:

- missions could be interpreted as either route-centric or area-centric;
- drone participation in mission state changes could be mistaken for drone ownership of the lifecycle;
- result validation is currently manual, while a future configurable validation policy is desired;
- `SignalQuality`, `KPI`, `Projection`, and visualization concerns were used inconsistently.

## Decisions

### Missions are route-centric

A mission is fundamentally an operator-defined drive-test route and its execution history. It is not modeled as belonging to an operational area. A mission name may describe the covered region; a dedicated region field may be introduced later if it becomes a real requirement.

### The backend is the execution authority

The backend is the control authority for the mission lifecycle, the platform's cockpit. Some state changes require participation from the drone (claim, status), but that does not give the drone independent authority over the lifecycle. The concrete transitions are those enforced by `PrismaMissionRepository` (see `uml/0014-mission-lifecycle-states.puml`).

### Result validation is currently operator-driven

An operator manually validates a mission result. The validation mechanism should stay behind a suitable seam so that other policies can be introduced later without changing the core result model. Automated or selectable policies are future extensibility, not a current requirement.

### Measurements are raw observations; KPIs are derived

A `Measurement` is an immutable observation collected during mission execution at a specific point in space and time. It carries raw observations (`rawObservations`) and does not contain derived KPI values. KPIs are derived from validated measurements after a mission result has been finalized. `Signal Quality` is the concrete KPI implemented. A generic persistent KPI hierarchy is not required until multiple concrete KPIs demonstrate a need for shared domain behavior.

### KPI terminology is explicit

- use **KPI** when discussing generic indicators or reusable abstractions;
- use **Signal Quality / SignalQuality** for the concrete current feature;
- use **KPI projection** for a derived geographic representation of a KPI;
- do not use `KPI` as a synonym for `SignalQuality` in domain-specific names.

KPI exploration is only available after the corresponding mission result has been finalized.

### Result revision authority

A mission result can have a sequence of revisions. A correction never changes an existing revision; it creates a new immutable revision. Exactly one **finalized** revision is authoritative at a time, and KPI projections use that authoritative revision.

## Consequences

- No operational-area aggregate is needed to create missions.
- Drone-facing contracts model participation in a backend-controlled lifecycle, not a drone-owned state machine.
- Validation policy can evolve later without making automated validation part of the current scope.
- Finalized revisions are immutable; a new revision may be created from an already-finalized one.
- The frontend/backend use `SignalQuality` for the current feature while keeping generic KPI concepts small and intentional. In the frontend this shows up as `SignalQualityRenderer`, `SignalQualityPalette`, `HttpSignalQualityApi`; the only generic `Kpi` names left are the `kpiRenderer` config key and `SIGNAL_QUALITY_KPI_KEY`.

## Amendments

- 2026-09: the earlier text repeated the revision-immutability sentences twice in "Consequences"; merged.
- 2026-09: **implementation note.** The repository makes the *latest saved* revision the result's active revision even when it is not finalized, whereas this ADR says one *finalized* revision is authoritative. Approved data is produced only while the active revision is finalized, so saving a draft revision after a finalized one temporarily removes the mission from projections. See ADR-0013.

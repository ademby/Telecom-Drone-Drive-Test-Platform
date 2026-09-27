# Route-centric missions, backend-controlled execution, and explicit KPI terminology

## Context

The prototype mixed several concepts that need to be explicit before the domain and interface redesign:

- missions could be interpreted as either route-centric or area-centric;
- drone participation in mission state changes could be mistaken for drone ownership of the lifecycle;
- result validation is currently manual, while a future configurable validation policy is desired;
- `SignalQuality`, `KPI`, `Projection`, and visualization concerns were used inconsistently.

## Decisions

### Missions are route-centric

A mission is fundamentally an operator-defined drive-test route and its execution history. The mission is not currently modeled as belonging to an operational area. A mission name may provide a human-readable description of the covered region. A dedicated descriptive region field or metadata may be introduced later if this becomes a real domain requirement.

### The backend is the execution authority

The backend is the control authority for the mission lifecycle — the platform's cockpit. Some state changes may require participation from the drone, but that does not give the drone independent authority over the mission lifecycle. The exact transitions and protocol between backend and drone will be derived from this principle during the detailed use-case and contract design.

### Result validation is currently operator-driven

For the current completion scope, an operator manually validates a mission result. The design should keep the validation mechanism behind a suitable seam so that additional validation policies can be introduced later without changing the core result model. Automated or selectable policies are future extensibility, not a current workflow requirement.

### Measurements are raw observations; KPIs are derived

A `Measurement` is an immutable observation collected during mission execution at a specific point in space and time. It represents collected facts and does not contain derived KPI values.

KPIs are derived from validated measurements after a mission result has been finalized. `Signal Quality` is the concrete KPI currently implemented. A generic persistent KPI hierarchy is not required until multiple concrete KPIs demonstrate a need for shared domain behavior.

### KPI terminology is explicit

`KPI` is the generic term for a key performance indicator derived from measurement data. `SignalQuality` is the name of the concrete KPI currently implemented by the platform.

Therefore:

- use **KPI** when discussing generic indicators or reusable abstractions;
- use **Signal Quality / SignalQuality** for the concrete current feature;
- use **KPI projection** for a derived geographic representation of a KPI;
- do not use `KPI` as a synonym for `SignalQuality` in domain-specific names.

KPI exploration is only available after the corresponding mission result has been finalized.

### Result revision authority

A mission result can have a sequence of finalized revisions. A correction never changes an existing revision; it creates a new immutable revision. Exactly one finalized revision is authoritative at a time, and KPI projections use that authoritative revision.

## Consequences

The domain model does not need an operational-area aggregate merely to support mission creation. Drone-facing contracts must model participation in a backend-controlled lifecycle rather than a drone-owned state machine. Validation policy can evolve later without making automated validation part of the current scope. Finalized result revisions are immutable; corrections are represented through a new revision rather than mutating a finalized revision. A new revision may be created from an already-finalized revision. Each revision remains immutable, and exactly one finalized revision is the current authoritative revision used by KPI projections. The frontend/backend architecture should use `SignalQuality` for the current feature while keeping generic KPI concepts small and intentional.

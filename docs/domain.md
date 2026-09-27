# The Drone Drive-Test Platform

The platform plans and executes telecom drone drive-test missions, receives their measurements, validates results, and presents approved geographic coverage data to telecom operators. It spans operator workflows, backend orchestration, and drone integration.

## Platform

**Operator**:
The human who plans missions, monitors execution, validates uploaded results, and explores approved measurements.

**Drone**:
A managed execution device with its own identity, capabilities, status, and authenticated relationship to the platform.

**Operational area**:
A geographic scope in which missions and approved measurements are managed. It may contain one or more countries and administrative hierarchies.

**Administrative geography**:
Versioned reference regions used for navigation, filtering, constraints, and reporting. A mission route is not owned by an administrative region.

## Mission execution

**Mission**:
An operator-defined, route-centric drive-test plan that may accumulate execution history, progressing through draft, planned, dispatched, running, completed, failed, or cancelled states. A mission owns immutable route revisions. The mission name may provide a human-readable description of the covered region; a dedicated descriptive region field or metadata may be introduced later if the domain requires it.

**Route revision**:
An immutable geographic version of a mission route. Editing the route creates a new revision. An execution references one specific route revision, preserving the exact route used for that execution.

**Execution**:
The act of executing a mission. Execution is currently implicit rather than represented by a first-class `ExecutionAttempt` domain entity. A failed mission can produce a new derived mission; it is not silently retried in place.

**Dispatch**:
The point at which a planned mission has been atomically claimed by its assigned drone and is eligible for execution.

**Missed dispatch**:
A terminal mission failure caused by the dispatch deadline passing before a drone claims the mission.

## Measurements and results

**Measurement**:
An immutable observation collected during mission execution at a specific point in space and time. It contains collected/raw network observations and validity information; derived KPI values are not part of the measurement itself.

**Mission result**:
The complete dataset uploaded for one mission execution, including its measurements and upload identity.

**Result revision**:
An immutable validation view of a mission result that records which observations are accepted or rejected and when it was finalized. Once finalized, a revision is never mutated; a correction is represented by a new revision.

**Approved measurement**:
A measurement included by the active finalized result revision and therefore eligible for approved projections.

**Projection**:
A reproducible derived view of approved measurements, such as a mission summary, administrative aggregation, or continuous geographic surface. A projection is available for KPI exploration only after the corresponding mission result has been finalized.

## Visualization

**Global surface**:
A projection of approved measurements across an operational area for a selected scope and time interval.

**Visualization policy**:
The interpretation metadata for a projection, including KPI units/range, no-data behavior, and presentation defaults.

**Data tile**:
A spatially bounded numeric tile used to render a projection. It contains data values, not presentation colors.

**Validation**:
The operator’s review of a mission result, including reversible acceptance/rejection decisions and finalization of a result revision.

## Terminology

**KPI**:
A generic architectural/domain term for a key performance indicator derived from measurement data. It is not the name of a specific feature.

**Signal Quality**:
The concrete KPI currently exposed by the platform. `SignalQuality` should therefore be used for the specific feature and its domain behavior, while `KPI` is reserved for generic abstractions or concepts shared by multiple indicators.

**KPI projection**:
A geographic or otherwise derived representation of a specific KPI over approved measurements. The current Signal Quality projection is only available after result finalization.

## Current operational decisions

- Missions are **route-centric**. An operational area is not currently required as a mission aggregate.
- The backend remains the **control authority / cockpit** for mission execution. Some state transitions may require drone participation, but the drone does not independently control the mission lifecycle.
- Result validation is currently **operator-driven**. The design should leave room for selectable validation policies later without making automated validation a current requirement.
- KPI exploration is based on **finalized results only**.
- Measurements represent **raw observations**; KPIs are derived after result finalization.
- Finalized result revisions are **immutable**; corrections use a new revision.
- A finalized result may be revised again: each correction creates a new immutable revision, while exactly one finalized revision is the current authoritative revision used for KPI projections.

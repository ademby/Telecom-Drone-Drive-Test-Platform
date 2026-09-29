# Immutable measurements with versioned result revisions

**Status:** Accepted. Open question on revision activation: see ADR-0013 (Proposed).

## Context

Drone uploads are the evidence behind every coverage claim. Operators must be able to reject bad points without destroying data, and corrections must be auditable and reproducible.

## Decision

Raw mission uploads and measurements remain immutable. Operator validation creates immutable result revisions; approved mission/global views are derived projections. Rejected observations remain stored and auditable but do not enter approved projections.

Representation (as implemented): a revision stores the ids of the **rejected** measurements and an optional `finalizedAt`. Acceptance is implicit (a measurement is accepted unless rejected). Approved data is computed from the result's active revision, only when that revision is finalized.

## Consequences

- Finalization is reproducible and historical decisions are auditable.
- Global overlap resolution can be recalculated without destructive cleanup.
- Projections (currently the Signal Quality surface) are recomputed from stored data and cached in memory; the cache is invalidated on finalize (ADR-0012) and keyed by a projection version.
- Because acceptance is implicit, a revision cannot express "reviewed and accepted" versus "never reviewed" for a given point.

## Amendments

- 2026-09: documented the rejected-ids representation (the earlier UML showed a `MeasurementDecision` enum that does not exist in code) and the projection versioning.

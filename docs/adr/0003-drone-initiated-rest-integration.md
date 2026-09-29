# Drone-initiated REST integration

**Status:** Accepted. Authentication is not implemented yet.

## Context

Drones operate on unreliable networks and behind NAT; the backend cannot assume it can reach them.

## Decision

Drones initiate communication through REST: discover planned missions, **claim** a mission, report **status**, and **upload** the result. The backend validates and incorporates those reports rather than requiring server-initiated drone connections. Authentication of drones is the target design.

## Consequences

- Operations must tolerate retries, disconnections and idempotency. Every mutating command takes an `Idempotency-Key`; repeating a key returns the mission's current state.
- Claim is an explicit acknowledgement: it fails with 409 after the dispatch deadline and with 403 for a different drone. A drone acknowledgement of operator cancellation is not implemented: cancelling a `DISPATCHED` or `RUNNING` mission only changes backend state, and later drone reports for it are rejected by the state guards.
- The operator UI is a separate client class: it plans missions, reviews results and reads projections. It does not call claim or status.

## Amendments

- 2026-09: recorded current reality. There is no drone authentication or registry; `droneId` in a request body is checked against the mission's assigned drone. `apps/drone-mock` is a hand-driven HTTP façade over claim and status only, does not poll, and does not upload results (demo results come from `tools/db` seeds).
- 2026-09: corrected earlier documentation that listed `POST /missions/:id/result/revisions` as a drone call; it is an operator call.

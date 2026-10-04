# Whole platform boundary with separated contexts

**Status:** Accepted (unchanged in substance; wording refreshed after the frontend refactor)

## Context

The product is the whole drone-drive-test platform, not only the browser application. It has three parts with different lifecycles and trust levels: the operator UI, the backend that orchestrates missions and results, and the drones that execute them.

## Decision

Frontend, backend orchestration, and drone integration remain explicit contexts. The NestJS deployment can serve the frontend without coupling browser workflows directly to drone behavior. Shared wire types live in `packages/contracts` and are imported as TypeScript source by both frontend and backend.

## Consequences

- The browser consumes backend contracts only; it never talks to a drone.
- The backend is authoritative for platform state.
- Drone communication remains an integration concern (ADR-0003).
- A contract change is a compile-time change for every consumer (`npm run check` covers contracts, frontend, and backend).

## Amendments

- 2026-09: added the `packages/contracts` sentence; earlier text spoke only of "backend contracts".

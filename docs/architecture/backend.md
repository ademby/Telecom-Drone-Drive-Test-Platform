# Backend architecture

Scope: `apps/backend` (NestJS, Prisma with the PostgreSQL driver adapter, class-validator). Shared wire types are in `packages/contracts`.

The frontend refactor did not change the backend structure; this document exists so that the whole platform is described in one place and so that statements in ADR-0007 that drifted from the code are corrected (see ADR-0012).

Diagram: [`../uml/0013-backend-module-structure.puml`](../uml/0013-backend-module-structure.puml), lifecycle: [`../uml/0014-mission-lifecycle-states.puml`](../uml/0014-mission-lifecycle-states.puml).

---

## 1. Modules

| Module | Contents | Depends on |
| ------ | -------- | ---------- |
| `CommonModule` (`@Global`) | `PrismaService`, `DomainEvents`, `ApiError` | none |
| `MissionModule` | `MissionController`, `MissionService`, `PrismaMissionRepository`, `MissionDispatchSweeper` | Common |
| `MissionResultModule` | `MissionResultController`, `MissionResultService`, `PrismaMissionResultRepository` (exported) | Common |
| `SignalQualityModule` | `SignalQualityController`, `SignalQualityService`, `signalQualityConfig` | Common, MissionResult (repository) |

`AppModule` also declares `HealthController` (`GET /health`).

Layering inside a module: **controller** (HTTP shape, `Idempotency-Key` header check) -> **service** (thin orchestration, emits events) -> **repository** (Prisma queries, all business guards and transactions). The mission and result services are intentionally thin; the guards live in the repositories.

Cross-module rule: `MissionModule` knows nothing about results or Signal Quality. `SignalQualityModule` imports the `MissionResultModule` repository to read approved measurements, and reacts to an event instead of being called (see 5).

## 2. HTTP surface

Mutating commands require an `Idempotency-Key` header (`ApiError` 400 if missing).

| Method and path | Caller | Purpose / guards |
| --------------- | ------ | ---------------- |
| `GET /health` | ops | liveness |
| `GET /missions?state&droneId` | operator, drone | list |
| `GET /missions/:id` | operator, drone | read |
| `POST /missions` | operator | create `DRAFT` with route revision 1 (route needs at least two coordinates) |
| `PATCH /missions/:id` | operator | `DRAFT` only; a new `geometry` creates a new immutable route revision |
| `POST /missions/:id/plan` | operator | `DRAFT` -> `PLANNED` |
| `POST /missions/:id/cancel` | operator | any non-terminal state -> `CANCELLED` |
| `POST /missions/:id/derive` | operator | `FAILED` only; creates a new `DRAFT` copying name, drone, schedule and the active route as revision 1, with `derivedFrom` set |
| `POST /missions/:id/claim` `{droneId}` | drone | `PLANNED` -> `DISPATCHED`; 403 if a different drone; 409 if the dispatch deadline passed |
| `POST /missions/:id/status` `{droneId, status, failureReason?}` | drone | `RUNNING` (from `DISPATCHED`), `COMPLETED` (from `RUNNING`), `FAILED` (from `DISPATCHED` or `RUNNING`, needs `EXECUTION_FAILED` or `DATA_INVALID`) |
| `POST /missions/:id/result` | drone | upload; mission must be `COMPLETED`, at most one result per mission (409), at least one measurement |
| `GET /missions/:id/result` | operator | result with measurements, active revision and history |
| `POST /missions/:id/result/revisions` `{rejectedMeasurementIds, finalize}` | **operator** | create a result revision; emits an event when `finalize` is true |
| `GET /missions/:id/result/approved-measurements` | operator | measurements minus rejections, only if the active revision is finalized |
| `GET /signal-quality/range` | operator UI | `{min, max, version}` of approved data |
| `GET /signal-quality/tiles/:z/:x/:y` | operator UI | 64x64 `Float32` grid, `Cache-Control: public, max-age=31536000, immutable`; clients add `?v=<version>` |

Note: the `revisions` endpoint is an **operator** operation. Earlier docs listed it among drone-facing calls.

### Idempotency

`IdempotencyKey` rows store `(key, missionId)`. When a key is seen again the repository returns the **current** state of that mission; it does not replay the original response and it does not verify that the key was used for the same operation. Keys are global, so clients must generate unique ones (the frontend uses `<command>-<missionId>` or adds a timestamp).

## 3. Cross-cutting behavior (`main.ts`)

- Body parser limit raised to 20 MB (large rejection lists in review commands).
- CORS `origin: "*"` (development posture; see `future-deployment.md` D-01).
- Global `ValidationPipe({ transform: true, whitelist: true })`.
- Global exception filter: `ApiError` -> `{ error }` with its status code (default 400); `HttpException` -> its status and message; anything else -> 500. Errors are logged with method and URL.
- No authentication or authorization exists yet. `droneId` in claim and status bodies is a plain assertion checked against the mission's assigned drone. ADR-0003 describes authenticated drones as the target.

## 4. Persistence (Prisma / PostgreSQL)

Tables: `Mission`, `RouteRevision`, `MissionResult`, `Measurement`, `ResultRevision`, `IdempotencyKey`. Enums `MissionState`, `FailureReason`.

- `Mission.activeRouteId` points to the current `RouteRevision`; `routeHistory` keeps every revision (`@@unique([missionId, revision])`).
- `MissionResult` is one-to-one with `Mission`; `activeRevisionId` points to a `ResultRevision`; `ResultRevision.rejectedMeasurementIds` is a JSON array of measurement ids (**accepted is implicit**: not rejected).
- `Measurement.rawObservations` is JSON (`Record<string, number>`); the KPI key currently used is `signalQuality`. The migration `renaming_kpis_to_observations` reflects that measurements hold raw observations, not derived KPIs (ADR-0008).
- Migrations are under `apps/backend/prisma/migrations`. The generated client lives in `src/generated/prisma/` and is git-ignored.

### Behavior to be aware of: which revision is "active"

`PrismaMissionResultRepository.review()` creates a new revision **and always makes it the result's `activeRevision`**, whether or not it is finalized. Approved data is then read only when the active revision has `finalizedAt`. Consequence: saving a non-finalized revision after a finalized one makes the mission drop out of approved projections until a new finalize, and no event is emitted for a non-finalizing save. This differs from the domain statement "exactly one *finalized* revision is authoritative" (`domain.md`, ADR-0008). Either the domain wording or the repository should change.

## 5. Events (ADR-0012)

`DomainEvents` is a small DI wrapper around Node's `EventEmitter` in `CommonModule`. One event exists: `ResultRevisionFinalized { missionId }`.

- Emitted by `MissionResultService.review()` when `command.finalize` is true, **after** the repository transaction has committed.
- Consumed by `SignalQualityService`, which calls `invalidate()` (drops the points snapshot and tile cache).
- In-process and synchronous: no persistence, no retry. If the process restarts the caches are empty anyway.

## 6. Mission dispatch sweeper

`MissionDispatchSweeper` (in `MissionModule`) runs `PrismaMissionRepository.sweepMissedDispatch()` every 10 seconds (timer is `unref`ed and cleared on shutdown). It bulk-updates `PLANNED` missions whose `dispatchDeadline` is in the past to `FAILED` with `failureReason = MISSED_DISPATCH`. It is not exposed over HTTP.

## 7. Signal Quality projection

`SignalQualityService` derives the global surface from **all missions whose active revision is finalized**, minus each revision's rejected ids, using only measurements that carry a finite numeric `signalQuality` observation.

1. **Points snapshot**: loaded through `allApprovedMeasurements()`, indexed in 0.01-degree spatial buckets, reused for 5 seconds (`pointsTtlMs`) or until invalidated.
2. **Version**: `<pointCount>-<round(sum(value) * 1000)>`; `"empty"` when there are no points. It changes when the approved set changes and is the cache key and the client's cache-buster. (It is a cheap checksum, not a hash: two different sets with the same count and sum would share a version.)
3. **Range**: min and max of approved values (`0..100` when empty).
4. **Tile**: for tile `(z, x, y)` a 64x64 grid (`SIGNAL_QUALITY_GRID_SIZE`); each cell center is converted from Web Mercator to lon/lat and interpolated with inverse-distance weighting over nearby buckets (search radius by zoom from `signalQualityConfig.radiusByZoom`, 16 or 24 nearest neighbours). No neighbours -> `NaN` (no data). Tiles are kept in an in-memory map (max 2000 entries, oldest evicted) keyed `version:z:x:y`.
5. **Invalidation**: the finalize event clears snapshot and tiles; a changed version also clears tiles when the snapshot reloads after its TTL.

Presentation (palette, thresholds, opacity) is intentionally absent (ADR-0004).

## 8. Configuration

| Value | Where | Notes |
| ----- | ----- | ----- |
| `DATABASE_URL` | `apps/backend/.env` | required, `PrismaService` throws without it |
| `PORT` | env | default 3000 |
| Signal Quality knobs | `signal-quality/signal-quality.config.ts` | module-owned domain config, not env |
| Request body limit | `main.ts` constant | 20 MB |

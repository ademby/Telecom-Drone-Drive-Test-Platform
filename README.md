# Telecom Drone Drive-Test Platform

A TypeScript npm-workspace monorepo for planning and executing telecom drone drive-test missions, collecting results, validating measurements, and presenting geographic signal-quality data.

## Requirements

`node`, `npm` and `podman`.

```bash
node --version
npm --version
podman --version
```

## Install

```bash
npm install
```

The install lifecycle generates the Prisma client into `apps/backend/src/generated/prisma/`. Generated Prisma code is ignored by Git and recreated automatically by builds/checks.

## Environment

Backend:

```bash
cp apps/backend/.env.example apps/backend/.env
```

Frontend HTTP mode:

```bash
cp apps/frontend/.env.example apps/frontend/.env
```

`VITE_API_BASE_URL` is required. The frontend talks only to the NestJS backend over HTTP (MockMissionApi has been removed).

## Lifecycle scripts

After a **fresh clone** (once `npm install` has finished):

```bash
npm run setup
```

Creates `.env` files if missing, starts PostgreSQL (Podman), waits until ready, generates Prisma client, applies migrations, and seeds signal-quality + demo missions. Admin boundary GeoJSON under `apps/frontend/public/data/` must already be present (committed runtime data).

After **rebooting** (or whenever the DB pod is stopped; volume data is kept):

```bash
npm run resume
```

Starts PostgreSQL and waits until ready. Does not re-seed.

**Launch** the full stack (frontend, backend, drone-mock):

```bash
npm run start
```

(`npm run dev` is the same command.)

## Development

Start PostgreSQL first (or use `npm run resume`):

```bash
npm run db:up
```

Then start the full application development stack:

```bash
npm run start
```

This starts:

```text
Frontend     http://localhost:5173
Backend      http://localhost:3000
Drone mock   http://localhost:3001
```

The Node services use TypeScript compilation in watch mode plus Node's native runtime watch. The backend also watches Prisma-generated code during development.

Run individual applications when needed:

```bash
npm run dev:backend
npm run dev:drone
npm run dev:frontend
```

Frontend alone (`dev:frontend`) still requires a reachable backend for mission, result, and Signal Quality APIs.

Check the database with:

```bash
npm run db:status
```

Stop the database with:

```bash
npm run db:down
```

Inspect database logs with:

```bash
npm run db:logs
```

Reset the local database volume with:

```bash
npm run db:reset
```

## Build and validation

Build everything:

```bash
npm run build
```

Type-check every workspace:

```bash
npm run check
```


Clean generated/build output:

```bash
npm run clean
```

## Database workflow

After changing `apps/backend/prisma/schema.prisma`:

```bash
npm run db:generate
npm run db:migrate -- --name <migration-name>
```

The backend uses Prisma's generated TypeScript client with the PostgreSQL driver adapter. The generated client is deliberately kept inside the backend source tree and is recreated instead of committed.

## npm/workspace conventions

The root package is the developer entry point. App packages own app-specific scripts and dependencies; root scripts compose those commands into platform-level workflows.

Common commands:

```text
npm run dev             full local application stack
npm run build           build all apps
npm run check           type-check all workspaces
npm run db:up           start PostgreSQL
npm run db:migrate      create/apply a development migration
npm run clean           remove generated/build output
```

There is intentionally one TypeScript version at the workspace root. Application `tsconfig.json` files extend `tsconfig.base.json` and only define runtime/module-specific options.

## Mission API

The shared mission contract models:

- `DRAFT → PLANNED → DISPATCHED → RUNNING → COMPLETED|FAILED`
- cancellation of non-terminal missions
- immutable route revisions
- idempotent commands
- derivation of a new draft mission from a failed mission

Coordinates exchanged with the API are GeoJSON WGS84 longitude/latitude. OpenLayers transforms them to the active map projection.

## Mission execution and results

Drones interact directly with the backend:

```text
POST /missions/:id/claim
POST /missions/:id/status
POST /missions/:id/result
POST /missions/:id/result/revisions
GET  /missions/:id/result
GET  /missions/:id/result/approved-measurements
```

Unclaimed planned missions past `dispatchDeadline` are failed by the dispatch sweeper as `MISSED_DISPATCH`.

Result uploads are immutable. Validation is represented by immutable result revisions; approved measurements are derived from the active finalized revision.

## Signal-quality surface

The backend returns raw interpolated **numeric** tiles and range/version metadata. Presentation (palette, opacity, thresholds) remains client-side. Canvas-worker rendering is the default; a WebGL adapter is retained behind `SignalQualityRenderer` (see `ui.config.ts` `kpiRenderer`).

Numeric tiles are cacheable independently of palette changes. The display uses a dark-red-to-light-blue scale and transparent no-data cells rather than pre-colored backend output.

## Administrative data

| Role | Location |
|------|----------|
| Source GeoJSON | `tools/data-pipeline/admin-boundaries/input/` |
| Preprocess / review scripts | `tools/data-pipeline/admin-boundaries/` |
| Preprocess reports | `tools/data-pipeline/admin-boundaries/reports/` |
| Runtime boundaries + manifest | `apps/frontend/public/data/` |
| Signal-quality generator | `tools/data-pipeline/signal-quality/generate.py` |
| Seed input signal-quality JSON | `apps/frontend/public/data/signal-quality.json` (DB seed only) |
| DB seed scripts | `tools/db/` |

## Development notes

The frontend exposes `globalThis.compositionRoot` only in Vite development mode. Production builds do not perform the development-only map/UI mutations that were previously embedded in startup code.

The backend loads `apps/backend/.env` at runtime through `dotenv/config`; the checked-in file is only the example configuration.

The drone mock is intentionally a development integration harness. It calls the real backend claim/status endpoints and does not represent a production drone protocol or authentication layer.


# Telecom Drone Drive-Test Platform

A TypeScript npm-workspace monorepo for planning and executing telecom drone drive-test missions, collecting results, validating measurements, and presenting geographic KPIs (only one KPI for the moment).

Documentation index: [`docs/README.md`](docs/README.md)

## Requirements

`node`, `npm` and `podman`.

```bash
node --version
npm --version
podman --version
```

## Install

```bash
# Install dependencies and run 'postinstall' scripts 
npm install


# One time setup : .env files, Administrative Boundaries, DB Containers, DB Migrations, DB Seeding 
npm run setup


## After **rebooting** (or whenever the DB pod is stopped; volume data is kept), run :
# npm run resume


# Launch the full stack : frontend & backend
npm start

# Frontend     http://localhost:5173
# Backend      http://localhost:3000

## Or run individual applications if needed :
# npm run dev:backend
# npm run dev:drone
# npm run dev:frontend

```

## Development 

Database helpers:

```bash
npm run db:status
npm run db:up
npm run db:down
npm run db:logs
npm run db:reset      # removes the local database volume
```
Database workflow:

After changing `apps/backend/prisma/schema.prisma`:

```bash
npm run db:generate
npm run db:migrate -- --name <migration-name>
```

Build and validation:

```bash
npm run build     # contracts check, then full-stack build
npm run check     # type-check every workspace
npm run clean     # remove generated/build output
```

## 

## Dev Notes

- `npm` workspaces : app packages own app-specific scripts and dependencies.
- The frontend exposes `globalThis.compositionRoot` only in Vite development mode.
- The backend loads `apps/backend/.env` through `dotenv/config`; the checked-in file is only an example.
- Production topology is a backlog: [`docs/future-deployment.md`](docs/future-deployment.md).

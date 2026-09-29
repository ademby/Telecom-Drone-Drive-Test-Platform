# Future tasks — deployment and production

Design notes and backlog only. **Not** part of the completed redesign phase (R-00..R-12). Status (2026-09): none of the items below is implemented.  
Development remains multi-process (`npm run setup` / `resume` / `start`, Podman DB, Vite, drone-mock). Production collapses to a single-server topology with NestJS delivering the frontend.

Related: `docs/future-features.md`, ADR-0001 (platform boundary), ADR-0003 (drone REST), ADR-0004 (numeric tiles).

---

## Target production topology (single server)

```text
Internet
   │
   ▼
[ reverse proxy — TLS, compression, rate limits ]   optional but recommended
   │
   ▼
NestJS  (API + static SPA)
   ├── REST  — missions, results, signal-quality, health
   └── GET /* — built Vite assets + SPA fallback
   │
   ├──► PostgreSQL (same host or managed instance)
   └──► real drones (REST claim / status / upload — no drone-mock)
```

**Principles**

- One public origin for the operator UI and API (no CORS-dependent browser setup).
- Backend remains authoritative for platform state.
- Browser never talks to drones; drones never need the SPA.
- Numeric tiles and client-side palette rules still apply (ADR-0004).
- Dev lifecycle scripts (`setup`, `resume`, seeds) are **not** the production boot path.

---

## Backlog

### D-01 — Production configuration

- [ ] Introduce explicit `NODE_ENV=production` behaviour in Nest (logging, CORS, error payloads).
- [ ] Replace open CORS (`origin: "*"`, set in `apps/backend/src/main.ts`) with a strict allow-list or same-origin-only.
- [ ] Document required env vars: `DATABASE_URL`, `PORT`, and any future secrets (drone keys, session).
- [ ] Keep product/rendering defaults in source modules (`ui.config.ts`, `signal-quality.config.ts`); only infrastructure in env.
- [ ] Ensure frontend build uses same-origin API (relative paths or empty `VITE_API_BASE_URL`), not `http://localhost:3000`.

### D-02 — Nest serves the SPA

- [ ] Wire Nest to serve the Vite production build (static root under a known path, e.g. `apps/frontend/dist` or a release `public/`).
- [ ] SPA fallback: non-API routes return `index.html` where needed.
- [ ] Do not serve Vite **dev** middleware in production.
- [ ] Confirm admin runtime files (`boundaries.geojson`, `manifest.json`) are either embedded in the SPA build or served as static assets from the same origin. They are generated (git-ignored), so the release build must run or receive the data pipeline output.
- [ ] Smoke-check: operator loads UI from Nest origin; missions / results / signal-quality work without a separate frontend port.

### D-03 — Build and release artifact

- [ ] Define a production build command that: checks contracts, builds frontend, builds backend, gathers migrations.
- [ ] Produce a minimal artifact: backend `dist/`, frontend static assets, Prisma migrations, production `package.json` / lockfile subset — **not** Vite sources, drone-mock, or data-pipeline unless required offline.
- [ ] Prefer `prisma migrate deploy` on release; never `prisma migrate dev` in production.
- [ ] Document image or tarball layout if Docker/Podman is used for the **app** process (DB may stay sidecar or external).

### D-04 — Database in production

- [ ] Decide: Postgres on the same host (systemd/Podman) vs managed Postgres.
- [ ] Persist data on a named volume or managed disk; backups and restore procedure.
- [ ] Production credentials (not `postgres/postgres`); rotate independently of dev.
- [ ] Bind DB to localhost or private network only when co-located with the app.
- [ ] Migration runbook: order of migrate deploy vs app start; failure handling.
- [ ] **Do not** run demo/signal-quality **dev seeds** as part of production boot. Seeding prod data is a separate, explicit operation if ever needed.

### D-05 — Process supervision on one host

- [ ] Run Nest under systemd, supervisord, or Compose `restart: unless-stopped`.
- [ ] Health endpoint already exists — use it for readiness/liveness checks.
- [ ] Log to stdout/journald or rotated files; avoid losing Nest logs on restart.
- [ ] Resource limits (memory/CPU) appropriate for tile interpolation + large result uploads (body size limits already raised for reviews — revisit under real load).

### D-06 — TLS and edge

- [ ] Terminate TLS at reverse proxy (Caddy/nginx) or equivalent.
- [ ] Security headers (e.g. `Content-Security-Policy` tuned for OpenLayers/workers, `Referrer-Policy`, etc.).
- [ ] Optional rate limiting on claim/upload and operator API.
- [ ] HTTP → HTTPS redirect.

### D-07 — Remove or gate development-only surfaces

- [ ] Do not deploy `apps/drone-mock`.
- [ ] Do not expose `globalThis.compositionRoot` or other DEV-only hooks in production builds (already gated by Vite `import.meta.env.DEV` — verify production bundle).
- [ ] Confirm `npm run setup` / `resume` remain documented as **developer** lifecycle only.

### D-08 — Drone integration (production)

- [ ] Replace mock drones with real device credentials and authenticated REST (claim / status / result).
- [ ] Idempotency and retry behaviour already required by ADR-0003 — verify under unreliable networks.
- [ ] Network path: drones reach Nest API only; firewall accordingly.
- [ ] No dependency on operator UI availability for drone lifecycle.

### D-09 — Operator access control (when required)

Today there is no operator or drone authentication at all; `droneId` in claim and status bodies is only compared with the mission's assigned drone.

Out of redesign scope; required before exposing a real network.

- [ ] Authentication for operator console (session/OIDC/etc.).
- [ ] Authorization boundaries (who may plan, validate, finalize).
- [ ] Audit trail for finalization and revision corrections (domain already keeps immutable revisions).

### D-10 — Observability and operations

- [ ] Structured logs for claim, upload, finalize, tile generation failures.
- [ ] Metrics: request latency, tile cache hit rate, DB pool, error rates.
- [ ] Alerting on health check failure and disk/DB capacity.
- [ ] Runbook: restart app, restart DB, re-run migrate, inspect projection version after finalize.

### D-11 — Caching and performance (only if needed)

- [ ] HTTP cache headers for numeric tiles keyed by projection `version` (palette changes must not require new tile bytes).
- [ ] Keep Canvas/WebGL dual path as product config, not deploy-time fork.
- [ ] Avoid speculative microservices or CDN splits until single-server limits are measured.

### D-12 — Documentation updates at implementation time

- [ ] README: short “Production” section pointing here; keep “Lifecycle scripts” as development-only.
- [ ] Note that `VITE_API_BASE_URL` is a **dev** seam; production prefers same origin.
- [ ] Record chosen host layout (systemd vs Compose) and backup procedure in ops notes (not necessarily in-repo).

---

## Explicit non-goals (until justified)

- Kubernetes / multi-node orchestration as the default deploy target.
- Separate BFF in front of Nest.
- Shipping drone-mock or the Vite dev server to production.
- Using `npm run setup` (seeds + Podman helpers) as production bootstrap.
- Generic multi-KPI deploy topology before a second KPI exists.
- Server-side palette / pre-colored tiles (contradicts ADR-0004).

---

## Suggested implementation order

1. **D-01** config + same-origin API assumptions  
2. **D-02** Nest static SPA  
3. **D-03** release artifact + **D-04** migrate deploy  
4. **D-05** + **D-06** process supervision and TLS  
5. **D-07** strip/gate dev surfaces  
6. **D-08** / **D-09** when real drones and real operators go live  
7. **D-10** / **D-11** under measured load  

---

## Dev vs prod quick reference

| Concern | Development | Production |
| -------- | ------------- | ------------ |
| UI | Vite `:5173` | Static files from Nest |
| API | Nest `:3000` | Same Nest process / origin |
| DB | Podman pod via `db:up` / `resume` | Co-located or managed Postgres |
| First-time machine | `npm install` → `npm run setup` | Provision host → artifact → migrate deploy → start Nest |
| After reboot | `npm run resume` → `npm run start` | systemd/Compose restarts app (+ DB if local) |
| Seeds | Demo + signal-quality seed scripts | Not on boot |
| Drone | `apps/drone-mock` | Real devices, authenticated |
| CORS | Permissive for local ports | Same-origin or strict allow-list |

---

## Acceptance sketch (when this work is done)

- Operator opens a single HTTPS URL; UI and API work without a second frontend server.
- `prisma migrate deploy` is the only migration path on release.
- Postgres data survives app restarts; backups exist.
- drone-mock and Vite dev are absent from the production process list.
- Documentation clearly separates developer lifecycle scripts from production boot.

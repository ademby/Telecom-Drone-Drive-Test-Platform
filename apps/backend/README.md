# Mission backend

NestJS + Prisma API for mission planning, execution state, result validation, and signal-quality projections.

From the repository root:

```bash
npm run dev:backend
```

The backend listens on `PORT` (default `3000`) and loads `apps/backend/.env` through `dotenv/config`.

Build/start directly:

```bash
npm run build --workspace @drone-drive/backend
npm start --workspace @drone-drive/backend
```

Required environment:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drone_drive
```

The generated Prisma client lives in `src/generated/prisma/` and is recreated by `generate`, `build`, and `check`.

Main endpoint groups:

- `/health`
- `/missions`
- `/missions/:id/claim`
- `/missions/:id/status`
- `/missions/:id/result`
- `/missions/:id/result/revisions`
- `/signal-quality/range`
- `/signal-quality/tiles/:z/:x/:y`

Mutating mission/result commands require an `Idempotency-Key` header. A repeated key returns the mission's current state (keys are global; use unique ones).

There is no authentication yet, and CORS is open (`origin: *`).

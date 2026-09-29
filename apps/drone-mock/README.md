# Drone integration simulator

A local integration harness for the drone side of the platform. It uses the shared mission contract and calls the real backend execution endpoints.

From the repository root:

```bash
npm run dev:drone
```

Or build/start directly:

```bash
npm run build --workspace @drone-drive/drone-mock
npm start --workspace @drone-drive/drone-mock
```

Environment:

```text
BACKEND_URL=http://localhost:3000
PORT=3001
```

Endpoints:

- `GET /health`
- `GET /planned-missions`
- `POST /missions/:id/claim`
- `POST /missions/:id/report`

Claims and reports are forwarded to the backend `claim` and `status` endpoints with a fresh `Idempotency-Key`. `GET /planned-missions` forwards `GET /missions?state=PLANNED`.

It is **driven by hand or script**: it does not poll planned missions on its own and it does **not** upload results (demo results come from `tools/db` seeds). It keeps no drone state and is only a local development tool; production drones call the backend directly (ADR-0003).

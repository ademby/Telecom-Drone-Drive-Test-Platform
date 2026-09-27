---
status: accepted
---

# Backend splits into Mission, MissionResult, and SignalQuality feature modules

`apps/backend/src` was a single flat directory (14 files) wired into one `AppModule`, with a real circular dependency hidden by the flatness: `MissionResultService.review()` calls `SignalQualityService.invalidate()` on finalize, while `SignalQualityService` reads approved measurements straight from `PrismaMissionResultRepository`.

We split into three `@Module`s along the boundary `domain.md` already draws (Measurements and results vs. Visualization): `MissionModule`, `MissionResultModule`, `SignalQualityModule`. `MissionDispatchSweeper` moves into `MissionModule` (it only ever touched `PrismaMissionRepository`).

The `mission-result ↔ signal-quality` cycle is broken by direction, not by `forwardRef`: `MissionResultModule` emits a `ResultRevisionFinalized` event (`EventEmitter2`) instead of calling `SignalQualityService.invalidate()` directly; `SignalQualityModule` subscribes and invalidates itself. `signal-quality → mission-result` remains as the one real import (reading approved measurements); the reverse edge is gone. Signal Quality doesn't need to know Mission Result exists as a concept, only that "the approved set changed."

`MissionError` — generic (`message`, `statusCode`), used by the global exception filter and both `mission` and `mission-result` controllers — was defined inside `mission-repository.ts` despite not being mission-specific. Renamed and relocated to `src/common/api-error.ts` as `ApiError`, imported by all three modules and `main.ts`.

## Considered options

- **`forwardRef()` circular module imports** for mission-result/signal-quality. Rejected: keeps both edges: doesn't force the direction decision, just hides it inside Nest's DI.
- **Fold SignalQuality into MissionResultModule.** Rejected: `domain.md` already treats Visualization (global surface, data tile, projection) as distinct from Measurements and results; collapsing them because of today's one caller recreates the flat-file problem one level up.

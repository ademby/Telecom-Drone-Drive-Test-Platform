# Backend splits into Mission, MissionResult, and SignalQuality feature modules

**Status:** Accepted. Amended by ADR-0012 (event mechanism).

## Context

`apps/backend/src` was a single flat directory (14 files) wired into one `AppModule`, with a real circular dependency hidden by the flatness: `MissionResultService.review()` called `SignalQualityService.invalidate()` on finalize, while `SignalQualityService` read approved measurements straight from `PrismaMissionResultRepository`.

## Decision

Split into three `@Module`s along the boundary `domain.md` already draws (Measurements and results vs. Visualization): `MissionModule`, `MissionResultModule`, `SignalQualityModule`, plus a global `CommonModule` for shared infrastructure. `MissionDispatchSweeper` lives in `MissionModule` (it only touches `PrismaMissionRepository`).

The `mission-result <-> signal-quality` cycle is broken **by direction**, not by `forwardRef`: `MissionResultModule` emits a `ResultRevisionFinalized` event instead of calling `SignalQualityService.invalidate()`; `SignalQualityModule` subscribes and invalidates itself. `signal-quality -> mission-result` remains as the one real import (reading approved measurements); the reverse edge is gone. Signal Quality does not need to know Mission Result exists as a concept, only that "the approved set changed".

`MissionError` (generic: `message`, `statusCode`) was defined inside `mission-repository.ts` despite not being mission-specific. It is now `ApiError` in `src/common/api-error.ts`, imported by all modules and `main.ts`.

## Considered options

- **`forwardRef()` circular module imports** for mission-result/signal-quality. Rejected: keeps both edges; it hides the direction decision inside Nest's DI.
- **Fold SignalQuality into MissionResultModule.** Rejected: `domain.md` treats Visualization (global surface, data tile, projection) as distinct from Measurements and results; collapsing them because of today's one caller recreates the flat-file problem one level up.

## Consequences

Three modules with one import edge; `MissionModule` is independent. Each module can be reasoned about, and later extracted, on its own.

## Amendments

- 2026-09: the original text named `EventEmitter2`. The code uses a small `DomainEvents` class over Node's `EventEmitter` (ADR-0012).
- 2026-09: `CommonModule` (global) provides `PrismaService`, `DomainEvents` and `ApiError`; the original text did not mention it.

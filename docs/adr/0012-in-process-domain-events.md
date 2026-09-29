# In-process domain events through DomainEvents

**Status:** Accepted. Amends ADR-0007.

## Context

ADR-0007 broke the `mission-result <-> signal-quality` cycle by direction: `MissionResultModule` emits an event and `SignalQualityModule` reacts. It named `EventEmitter2` (`@nestjs/event-emitter`) as the mechanism. The code does not use it.

## Decision

A small DI-friendly class, `DomainEvents`, in the global `CommonModule`, wraps Node's built-in `EventEmitter`:

- `emitResultRevisionFinalized({ missionId })`
- `onResultRevisionFinalized(listener)`

`MissionResultService.review()` emits after the repository call has returned (the transaction is committed) and only when `command.finalize` is true. `SignalQualityService` subscribes in its constructor and calls `invalidate()`.

## Rationale

- No extra dependency for a single event.
- A typed method per event is easier to follow than string event names.
- The mechanism is easy to replace, for example by an outbox or by publishing to the SSE channel of `future-features.md`, without touching producers' business code.

## Consequences

- Delivery is synchronous, in-process, at-most-once, and unpersisted. That is acceptable because the only consumer is an in-memory cache that is empty after a restart.
- Listener errors would surface in the emitting request; the current listener cannot throw in practice.
- **If a second event or a second consumer appears**, revisit adopting `@nestjs/event-emitter`; do not grow `DomainEvents` into a bus.
- No event is emitted for non-finalizing saves (see ADR-0013).

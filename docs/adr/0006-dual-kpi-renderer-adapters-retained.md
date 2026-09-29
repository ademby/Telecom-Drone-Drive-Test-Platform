# Keep both Signal Quality renderer adapters behind one interface

**Status:** Accepted. (The file keeps its original name so existing links work; the interface is now called `SignalQualityRenderer`, not `KpiRenderer`.)

## Context

`SignalQualityTileSource_ForWebGL` looked like abandoned prototype duplication next to the live Canvas-worker path (`SignalQualityTileSource`), and an architecture review flagged it for deletion as dead code with no second live caller.

## Decision

Keep both as real adapters behind one interface, `SignalQualityRenderer` (`layer`, `setRange`, `setPalette`, `setVisible`, `dispose`), implemented by `HttpSignalQualityRenderer`, which chooses the tile source at construction. There is a concrete planned improvement to the Canvas path (round-robin colorization across a worker pool, to raise tile resolution without one worker becoming a bottleneck), and WebGL remains the fallback if that does not reach acceptable quality. Two adapters with a stated reason each is a real seam.

Selection is a static `kpiRenderer: 'canvas' | 'webgl'` flag in `ui.config.ts`, not a runtime operator toggle, because WebGL's current output quality is not operator-ready.

## Consequences

- WebGL code is kept alive and must keep compiling.
- The renderer is constructed by `HeatmapWorkflow`; the tile source loads tiles only through `SignalQualityApi.getTile`.
- `ui.config.ts` reserves a `workerPoolSize` knob (default `1`).

## Amendments

- 2026-09: the earlier text referred to `KpiRenderer`, `HeatmapRenderer` and `SignalQualityVisualizer`; none exist in code. The interface is `SignalQualityRenderer`.
- 2026-09: `workerPoolSize` is currently **not read by any code**; the Canvas source creates exactly one worker. The seam is a comment, not yet an implementation.
- 2026-09: the dead WebGL block formerly inside `MapController` is gone, as decided (ADR-0005); WebGL now lives only in `SignalQualityTileSource_ForWebGL` and the WebGL branch of `HttpSignalQualityRenderer`.

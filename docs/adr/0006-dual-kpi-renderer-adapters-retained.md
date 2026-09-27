# Keep both Signal Quality renderer adapters behind one `KpiRenderer` interface

`SignalQualityTileSource_ForWebGL` / `SignalQualityVisualizer_ForWebGL` looked like abandoned prototype duplication next to the live Canvas-worker path (`SignalQualityTileSource` / `SignalQualityVisualizer`), and an architecture review flagged them for deletion as dead code with no second live caller.

We're keeping both as real adapters behind one `KpiRenderer` interface (already close to the existing `HeatmapRenderer` shape), not deleting WebGL. There is a concrete planned improvement to the Canvas path — round-robin colorization across a worker pool, to raise tile resolution without the single worker becoming a bottleneck — and WebGL remains the fallback path if that doesn't reach acceptable visual quality on its own. Two adapters with a stated reason each is a real seam, not a hypothetical one.

Selection between adapters is a static `kpiRenderer: 'canvas' | 'webgl'` flag in `ui.config.ts`, not a runtime operator-facing toggle: WebGL's current output quality is not operator-ready. The dead commented-out WebGL block inside `MapController` is still removed regardless (ADR-0005 moves that code into `HeatmapWorkflow`'s own `LayerGroup`), so this ADR only concerns keeping the adapter, not its old location.

`ui.config.ts` also gains a `workerPoolSize` knob, defaulted to `1` (today's behavior), as the seam for the round-robin work later.

**Implementation note (R-06+):** the shared interface is named `SignalQualityRenderer` (`HttpSignalQualityRenderer`); Canvas and WebGL tile sources sit behind it. Historical prototype names `SignalQualityVisualizer` / `HeatmapRenderer` no longer exist in code.

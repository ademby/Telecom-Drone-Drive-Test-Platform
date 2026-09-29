# Numeric tiles with client-side presentation

**Status:** Accepted

## Context

Broad geographic projections need server-side interpolation, which is expensive, while operators want to change colors, thresholds and opacity freely.

## Decision

Projections are served as **numeric** data tiles: a 64 x 64 row-major `Float32` grid per Web Mercator `z/x/y` (`SIGNAL_QUALITY_GRID_SIZE` in `packages/contracts`), with `NaN` meaning no data. A separate `range` call returns `{min, max, version}`; `version` changes whenever the approved set changes. Tiles are served with `Cache-Control: public, max-age=31536000, immutable`, and clients append `?v=<version>` so a new version is a new URL.

The frontend colorizes on the client. The default path is a Canvas tile source that hands numeric grids to a module worker, which applies a palette lookup table (no-data cells transparent) and returns an image; an OpenLayers WebGL adapter is retained as an alternate (ADR-0006). Palette, opacity and thresholds remain client-side.

## Consequences

- Server interpolation cost is separated from operator-controlled styling.
- Numeric tiles cache by version; palette or range-presentation changes re-colorize from the client's numeric cache with no request (the OpenLayers tile key combines data version and a presentation generation).
- A new version clears the client's numeric cache so tiles are re-requested.
- The backend never sends colors, and nothing palette-related exists in `packages/contracts`.

## Amendments

- 2026-09: replaced the description of the renderer seam (now `SignalQualityRenderer`), added the tile format, cache headers and the version query.

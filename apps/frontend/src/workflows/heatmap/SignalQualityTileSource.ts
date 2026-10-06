import type { SignalQualityApi } from "@drone-drive/contracts/signal-quality";
import { SIGNAL_QUALITY_GRID_SIZE } from "@drone-drive/contracts/signal-quality";
import ImageTileSource from "ol/source/ImageTile.js";
import { createXYZ } from "ol/tilegrid.js";
import { uiConfig } from "../../ui.config.js";
import {
  paletteToWorkerStops,
  type SignalQualityPalette,
} from "./SignalQualityPalette.js";

const TILE_SIZE = uiConfig.tileSize;
const GRID_SIZE = SIGNAL_QUALITY_GRID_SIZE;
const MAX_NUMERIC_TILES = uiConfig.maxNumericTileCache;
const TILE_GRID = createXYZ({
  tileSize: TILE_SIZE,
  maxZoom: uiConfig.maxZoom,
});

interface TileResult {
  type: "tile";
  id: number;
  bitmap: ImageBitmap;
}

type NumericTile = Float32Array;

/**
 * Fetches pre-interpolated numeric grid tiles via SignalQualityApi and colorizes them
 * client-side (worker). Numeric data is cached by version so palette/range presentation
 * changes never refetch the network (ADR-0004).
 */
export class SignalQualityTileSource extends ImageTileSource {
  private readonly worker: Worker;
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (image: ImageBitmap) => void;
      reject: (error: Error) => void;
    }
  >();

  private version = "unversioned";
  /** Bumped on palette/range presentation changes so OL re-invokes the loader. */
  private presentationGeneration = 0;
  private readonly numericCache = new Map<string, NumericTile>();
  private readonly inFlight = new Map<string, Promise<NumericTile>>();

  constructor(private readonly api: SignalQualityApi) {
    super({
      projection: "EPSG:3857",
      tileGrid: TILE_GRID,
      wrapX: false,
      interpolate: true,
      transition: 150,
      loader: (z, x, y) => this.requestTile(z, x, y),
    });

    // workerPoolSize is the ADR-0006 seam for a future round-robin pool; size 1 today.
    this.worker = new Worker(
      new URL("./signal-quality.worker.ts", import.meta.url),
      { type: "module" },
    );

    this.worker.onmessage = (event: MessageEvent<TileResult>) => {
      const result = event.data;
      const pending = this.pending.get(result.id);
      if (!pending) {
        result.bitmap.close();
        return;
      }
      this.pending.delete(result.id);
      pending.resolve(result.bitmap);
    };

    this.worker.onerror = (event) => {
      const error = new Error(event.message || "Signal Quality worker failed");
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  setRange(min: number, max: number, version: string): void {
    const versionChanged = this.version !== version;
    this.version = version;

    if (versionChanged) {
      this.numericCache.clear();
      this.inFlight.clear();
    }

    this.worker.postMessage({ type: "config", min, max });
    this.presentationGeneration += 1;
    this.changed();
  }

  setPalette(palette: SignalQualityPalette): void {
    this.worker.postMessage({
      type: "palette",
      stops: paletteToWorkerStops(palette),
    });
    this.presentationGeneration += 1;
    this.changed();
  }

  public override getKey(): string {
    // Version identifies numeric data; generation forces re-colorization without network.
    return `signal-quality-canvas-${this.version}-p${this.presentationGeneration}`;
  }

  private async requestTile(
    z: number,
    x: number,
    y: number,
  ): Promise<ImageBitmap> {
    const grid = await this.loadNumeric(z, x, y);

    // Copy before transfer so the numeric cache retains its own buffer.
    const transferable = grid.buffer.slice(
      grid.byteOffset,
      grid.byteOffset + grid.byteLength,
    );

    const id = this.nextRequestId++;
    return new Promise<ImageBitmap>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage(
        { type: "grid-tile", id, grid: transferable, size: GRID_SIZE },
        [transferable],
      );
    });
  }

  private loadNumeric(z: number, x: number, y: number): Promise<NumericTile> {
    const key = `${this.version}:${z}:${x}:${y}`;
    const cached = this.numericCache.get(key);
    if (cached) {
      this.touch(key, cached);
      return Promise.resolve(cached);
    }

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = this.api
      .getTile({ z, x, y })
      .then((tile) => {
        // Own a detached copy so transferred worker buffers cannot corrupt the cache.
        const owned = new Float32Array(tile);
        this.touch(key, owned);
        return owned;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    return promise;
  }

  private touch(key: string, tile: NumericTile): void {
    this.numericCache.delete(key);
    this.numericCache.set(key, tile);
    while (this.numericCache.size > MAX_NUMERIC_TILES) {
      const oldest = this.numericCache.keys().next().value;
      if (oldest === undefined) break;
      this.numericCache.delete(oldest);
    }
  }

  dispose(): void {
    this.worker.terminate();
    this.numericCache.clear();
    this.inFlight.clear();
    for (const pending of this.pending.values()) {
      pending.reject(new Error("Signal Quality source disposed"));
    }
    this.pending.clear();
    super.dispose();
  }
}

export default SignalQualityTileSource;

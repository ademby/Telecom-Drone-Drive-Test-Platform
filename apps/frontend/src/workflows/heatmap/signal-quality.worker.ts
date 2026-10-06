import paletteSingleton, { paletteToWorkerStops } from "./SignalQualityPalette";
import { uiConfig } from "../../ui.config.js";

const TILE_SIZE = uiConfig.tileSize;
const TILE_PIXEL_ALPHA = uiConfig.tilePixelAlpha;
const LUT_SIZE = 1024;

let min = 0;
let max = 100;
let paletteLut = new Uint8Array(LUT_SIZE * 4);

// HeatmapWorkflow pushes replacements via a `"palette"` message so edits repaint live.
let stops: Array<[number, string]> = paletteToWorkerStops(
  paletteSingleton.signalQualityPalette,
);
buildPaletteLut();

self.onmessage = async (
  event: MessageEvent<
    | { type: "config"; min: number; max: number }
    | { type: "palette"; stops: Array<[number, string]> }
    | { type: "grid-tile"; id: number; grid: ArrayBuffer; size: number }
  >,
) => {
  const message = event.data;

  if (message.type === "config") {
    min = message.min;
    max = message.max;
    return;
  }

  if (message.type === "palette") {
    if (message.stops.length >= 2) {
      stops = message.stops;
      buildPaletteLut();
    }
    return;
  }

  if (message.type === "grid-tile") {
    const values = new Float32Array(message.grid);
    const bitmap = await renderPrecomputedGrid(values, message.size);
    self.postMessage(
      { type: "tile", id: message.id, bitmap },
      { transfer: [bitmap] },
    );
  }
};

function createEmptyTile(): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create 2D context");
  }
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
  return createImageBitmap(canvas);
}

function parseHexRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/**
 * Colorizes a numeric grid already interpolated server-side.
 * No interpolation here — only value → color/opacity (ADR-0004).
 * NaN cells are fully transparent (no-data).
 * Floating-point values are preserved through LUT indexing (no integer cast of KPI values).
 */
async function renderPrecomputedGrid(
  grid: Float32Array,
  size: number,
): Promise<ImageBitmap> {
  const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
  const context = canvas.getContext("2d");
  if (!context) return createEmptyTile();

  const image = context.createImageData(size, size);
  for (let i = 0; i < size * size; i += 1) {
    const value = grid[i];
    const offset = i * 4;
    if (Number.isNaN(value)) {
      image.data[offset + 3] = 0;
      continue;
    }
    const lutIndex = paletteIndex(value, min, max);
    const lutOffset = lutIndex * 4;
    image.data[offset] = paletteLut[lutOffset];
    image.data[offset + 1] = paletteLut[lutOffset + 1];
    image.data[offset + 2] = paletteLut[lutOffset + 2];
    image.data[offset + 3] = TILE_PIXEL_ALPHA;
  }

  const small = new OffscreenCanvas(size, size);
  const smallContext = small.getContext("2d")!;
  smallContext.putImageData(image, 0, 0);
  context.imageSmoothingEnabled = true;
  context.drawImage(small, 0, 0, TILE_SIZE, TILE_SIZE);
  return createImageBitmap(canvas);
}

function paletteIndex(value: number, minimum: number, maximum: number): number {
  const t = Math.min(
    1,
    Math.max(0, (value - minimum) / (maximum - minimum || 1)),
  );
  return Math.min(LUT_SIZE - 1, Math.round(t * (LUT_SIZE - 1)));
}

function buildPaletteLut(): void {
  paletteLut = new Uint8Array(LUT_SIZE * 4);
  let stopIndex = 1;
  let left = parseHexRgb(stops[0][1]);
  let right = parseHexRgb(stops[1][1]);

  for (let i = 0; i < LUT_SIZE; i += 1) {
    const t = i / (LUT_SIZE - 1);
    while (stopIndex < stops.length - 1 && t > stops[stopIndex][0]) {
      stopIndex += 1;
      left = parseHexRgb(stops[stopIndex - 1][1]);
      right = parseHexRgb(stops[stopIndex][1]);
    }

    const start = stops[stopIndex - 1][0];
    const end = stops[stopIndex][0];
    const p = Math.min(1, Math.max(0, (t - start) / (end - start)));
    const offset = i * 4;
    paletteLut[offset] = Math.round(left[0] + (right[0] - left[0]) * p);
    paletteLut[offset + 1] = Math.round(left[1] + (right[1] - left[1]) * p);
    paletteLut[offset + 2] = Math.round(left[2] + (right[2] - left[2]) * p);
    paletteLut[offset + 3] = 255;
  }
}

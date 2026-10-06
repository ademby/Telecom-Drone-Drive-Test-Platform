/**
 * The Signal Quality color ramp. Presentation-only (ADR-0004): never sent to or received from
 * the backend, which only ever deals in numeric values. Owned at runtime by `HeatmapWorkflow`.
 */
export interface SignalQualityPaletteStop {
  /** Normalized position along the value range, `0` (worst) to `1` (best). */
  readonly offset: number;
  /** `#rrggbb` color at this stop. */
  readonly color: string;
}

export type SignalQualityPalette = readonly SignalQualityPaletteStop[];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const DEFAULT_SIGNAL_QUALITY_PALETTE: SignalQualityPalette = [
  { offset: 0.0, color: "#000000" },
  { offset: 0.2, color: "#e01b24" },
  { offset: 0.4, color: "#9141ac" },
  { offset: 0.5, color: "#1a5fb4" },
  { offset: 0.6, color: "#00fffb" },
  { offset: 1.0, color: "#ffffff" },
];
export const DEFAULT_SIGNAL_QUALITY_PALETTE_2: SignalQualityPalette = [
  { offset: 0.0, color: "#3b0000" },
  { offset: 0.2, color: "#e01b24" },
  { offset: 0.4, color: "#ffee00" },
  { offset: 0.5, color: "#00ff0d" },
  { offset: 0.6, color: "#00fffb" },
  { offset: 1.0, color: "#ffffff" },
];

/** A palette needs at least two ordered stops spanning the full `0..1` range with valid colors. */
export function isValidPalette(palette: SignalQualityPalette): boolean {
  if (palette.length < 2) return false;
  if (palette[0].offset !== 0 || palette[palette.length - 1].offset !== 1)
    return false;
  for (const stop of palette) {
    if (!HEX_COLOR.test(stop.color)) return false;
    if (stop.offset < 0 || stop.offset > 1) return false;
  }
  for (let i = 1; i < palette.length; i += 1) {
    if (palette[i].offset <= palette[i - 1].offset) return false;
  }
  return true;
}

/** CSS `linear-gradient` matching a palette exactly, for legend rendering. */
export function paletteToCssGradient(palette: SignalQualityPalette): string {
  const stops = palette.map(
    (stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`,
  );
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/** The one KPI that drives measurement point/row color today. Matches the backend's own
 * `KPI_KEY` (see `apps/backend/src/signal-quality/signal-quality.service.ts`) and the seed script's output —
 * camelCase, not the display label used in the legend. */
export const SIGNAL_QUALITY_KPI_KEY = "signalQuality";

/** Colors every measurement's Signal Quality value against the *shared* min/max of the set. */
export function colorMeasurementsBySignalQuality<
  T extends {
    readonly id: string;
    readonly rawObservations: Readonly<Record<string, number>>;
  },
>(measurements: readonly T[]): Map<string, string> {
  const values = measurements.map(
    (measurement) => measurement.rawObservations[SIGNAL_QUALITY_KPI_KEY] ?? 0,
  );
  const colors = new Map<string, string>();
  for (const measurement of measurements) {
    const value = measurement.rawObservations[SIGNAL_QUALITY_KPI_KEY] ?? 0;
    colors.set(measurement.id, sampleSignalQualityPalette(value));
  }
  return colors;
}

/**
 * Sample a single `#rrggbb` color for one value, clamped into `[min, max]` before
 * normalizing — a value at or beyond either bound is pinned to the nearest palette stop
 * rather than extrapolated. Linear per-channel interpolation between the two bracketing
 * stops; O(stops), fine for per-feature point styling (not the raster LUT path the
 * worker uses for tiles).
 */
export function sampleSignalQualityPalette(value: number): string {
  const span = paletteSingleton.max - paletteSingleton.min;
  const t = span > 0 ? clamp01((value - paletteSingleton.min) / span) : 0;
  const palette = paletteSingleton.signalQualityPalette;
  let lower = palette[0];
  let upper = palette[palette.length - 1];
  for (let i = 1; i < palette.length; i += 1) {
    if (t <= palette[i].offset) {
      lower = palette[i - 1];
      upper = palette[i];
      break;
    }
  }

  const stopSpan = upper.offset - lower.offset;
  const localT = stopSpan > 0 ? (t - lower.offset) / stopSpan : 0;
  return mixHexColors(lower.color, upper.color, localT);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mixHexColors(from: string, to: string, t: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `#${[r, g, bl].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Wire shape the color worker expects: `[offset, color]` tuples. */
export function paletteToWorkerStops(
  palette: SignalQualityPalette,
): Array<[number, string]> {
  return palette.map((stop) => [stop.offset, stop.color]);
}

class PaletteSingleton {
  signalQualityPalette: SignalQualityPalette;
  min: number;
  max: number;
  constructor() {
    this.signalQualityPalette = DEFAULT_SIGNAL_QUALITY_PALETTE;
    this.min = 0;
    this.max = 100;
  }
  setRange(min: number, max: number) {
    this.min = min;
    this.max = max;
  }
  setSignalQualityPalette(palette: SignalQualityPalette): void {
    this.signalQualityPalette = palette;
  }
  resetSignalQualityPalette(){
    this.signalQualityPalette = DEFAULT_SIGNAL_QUALITY_PALETTE;
  }
}

const paletteSingleton = new PaletteSingleton();
export default paletteSingleton;

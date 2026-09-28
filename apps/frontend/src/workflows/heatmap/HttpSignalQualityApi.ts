import type {
  SignalQualityApi,
  SignalQualityRange,
  SignalQualityTile,
  SignalQualityTileCoord,
} from "@drone-drive/contracts/signal-quality";
import { signalQualityTilePath } from "@drone-drive/contracts/signal-quality";

function requireApiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!base) {
    throw new Error(
      "VITE_API_BASE_URL is required. Or implement 'same BaseUrl' logic.",
    );
  }
  return base.replace(/\/$/, "");
}

/**
 * Sole HTTP owner for Signal Quality range + tiles (R-05/R-06).
 * Hides base URL, path helper, version query, Float32 decode, and error mapping.
 * Caches the last range version so tile requests cache-bust against the approved set.
 */
export class HttpSignalQualityApi implements SignalQualityApi {
  private readonly baseUrl: string;
  private tileVersion = "unversioned";

  constructor() {
    this.baseUrl = requireApiBaseUrl();
  }

  async getRange(): Promise<SignalQualityRange> {
    const response = await fetch(`${this.baseUrl}/signal-quality/range`);
    if (!response.ok) {
      throw new Error(
        `Failed to load Signal Quality range: ${response.status}`,
      );
    }
    const range = (await response.json()) as SignalQualityRange;
    this.tileVersion = range.version;
    return range;
  }

  async getTile(coord: SignalQualityTileCoord): Promise<SignalQualityTile> {
    const path = signalQualityTilePath(coord);
    const url = `${this.baseUrl}${path}?v=${encodeURIComponent(this.tileVersion)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load Signal Quality tile: ${response.status}`);
    }
    const bytes = await response.arrayBuffer();
    return new Float32Array(bytes);
  }
}

export default HttpSignalQualityApi;

import type {
  CreateMissionCommand,
  Mission,
  MissionApi,
  MissionId,
  MissionQuery,
  UpdateDraftMissionCommand,
} from "@drone-drive/contracts/mission";

function requireApiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!base) {
    throw new Error(
      "VITE_API_BASE_URL is required. Or implement 'same BaseUrl' logic.",
    );
  }
  return base.replace(/\/$/, "");
}

export class HttpMissionApi implements MissionApi {
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = requireApiBaseUrl();
  }

  list(query: MissionQuery = {}): Promise<readonly Mission[]> {
    const params = new URLSearchParams();
    if (query.state) params.set("state", query.state);
    if (query.droneId) params.set("droneId", query.droneId);
    const suffix = params.size ? `?${params.toString()}` : "";
    return this.request<readonly Mission[]>(`/missions${suffix}`);
  }

  get(id: MissionId): Promise<Mission> {
    return this.request<Mission>(`/missions/${encodeURIComponent(id)}`);
  }

  create(command: CreateMissionCommand): Promise<Mission> {
    return this.request<Mission>("/missions", {
      method: "POST",
      body: JSON.stringify(command),
    });
  }

  updateDraft(
    id: MissionId,
    command: UpdateDraftMissionCommand,
  ): Promise<Mission> {
    return this.request<Mission>(`/missions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(command),
    });
  }

  plan(id: MissionId, idempotencyKey: string): Promise<Mission> {
    return this.command(id, "plan", idempotencyKey);
  }

  cancel(id: MissionId, idempotencyKey: string): Promise<Mission> {
    return this.command(id, "cancel", idempotencyKey);
  }

  deriveFromFailure(id: MissionId, idempotencyKey: string): Promise<Mission> {
    return this.command(id, "derive", idempotencyKey);
  }

  private command(
    id: MissionId,
    command: string,
    idempotencyKey: string,
  ): Promise<Mission> {
    return this.request<Mission>(
      `/missions/${encodeURIComponent(id)}/${command}`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    );
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(
        payload?.error ?? `Mission API request failed: ${response.status}`,
      );
    }
    return payload as T;
  }
}

export default HttpMissionApi;

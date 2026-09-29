# Architecture diagrams

Mermaid overview diagrams that render directly on GitHub. They describe the code **as it is after the frontend refactor** (commits `refactor 1` to `refactor 5`).

- Detailed prose: [`architecture/frontend.md`](architecture/frontend.md), [`architecture/backend.md`](architecture/backend.md)
- Vocabulary: [`domain.md`](domain.md)
- Decisions: [`adr/`](adr/)
- Fine-grained PlantUML sources (class, sequence, state): [`uml/`](uml/), index at the bottom of this page

## 1. Domain overview

```mermaid
classDiagram
    class Mission {
        state
        droneId
        earliestStart
        dispatchDeadline
        failureReason
        derivedFrom
    }
    class RouteRevision {
        revision
        geometry
    }
    class MissionResult {
        deviceId
        uploadedAt
    }
    class Measurement {
        capturedAt
        longitude
        latitude
        rawObservations
    }
    class ResultRevision {
        revision
        rejectedMeasurementIds
        finalizedAt
    }
    class Projection {
        version
        min
        max
    }

    Mission "1" *-- "1..*" RouteRevision : routeHistory
    Mission "1" --> "0..1" MissionResult : produces
    MissionResult "1" *-- "1..*" Measurement
    MissionResult "1" *-- "0..*" ResultRevision
    ResultRevision ..> Measurement : rejects by id
    Projection ..> ResultRevision : from active finalized revisions
```

## 2. Mission lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT: create
    DRAFT --> DRAFT: updateDraft (new route revision)
    DRAFT --> PLANNED: plan
    PLANNED --> DISPATCHED: claim (drone)
    DISPATCHED --> RUNNING: status RUNNING (drone)
    RUNNING --> COMPLETED: status COMPLETED (drone)
    DISPATCHED --> FAILED: status FAILED (drone)
    RUNNING --> FAILED: status FAILED (drone)
    PLANNED --> FAILED: MISSED_DISPATCH (sweeper)

    DRAFT --> CANCELLED: cancel
    PLANNED --> CANCELLED: cancel
    DISPATCHED --> CANCELLED: cancel
    RUNNING --> CANCELLED: cancel

    COMPLETED --> [*]
    FAILED --> [*]
    CANCELLED --> [*]
```

A `FAILED` mission is never retried in place: `derive` creates a **new** `DRAFT` mission with `derivedFrom` pointing at the failed one. Result review and finalization do not change `MissionState`.

## 3. System boundaries

The browser only talks to the backend. Drones are **clients** of the backend (ADR-0003): the backend never opens a connection to a drone. In development `apps/drone-mock` is a small HTTP façade that a developer drives by hand; it forwards claim/status calls to the real backend endpoints.

```mermaid
flowchart LR
    subgraph Browser["Browser: apps/frontend (Vite + OpenLayers)"]
        UI["Operator UI<br/>3 workflows + map"]
    end

    subgraph Backend["apps/backend (NestJS)"]
        direction TB
        MM["MissionModule"]
        MRM["MissionResultModule"]
        SQM["SignalQualityModule"]
        CM["CommonModule<br/>Prisma, DomainEvents, ApiError"]
    end

    DB[("PostgreSQL")]
    DRONE["Drone (external)<br/>apps/drone-mock in dev"]
    CONTRACTS["packages/contracts<br/>shared TypeScript types"]

    UI -- "REST /missions, /missions/:id/result,<br/>/signal-quality" --> Backend
    DRONE -- "REST claim / status / result upload<br/>(drone-initiated)" --> Backend
    Backend --> DB

    UI -. "imports types" .-> CONTRACTS
    Backend -. "imports types" .-> CONTRACTS
    DRONE -. "imports types" .-> CONTRACTS
```

## 4. Frontend startup

```mermaid
sequenceDiagram
    participant Main as main.ts
    participant Root as CompositionRoot
    participant Map as MapController
    participant Loader as AdminDatasetLoader
    participant Panel as OperationsPanel
    participant Nav as NavigationWorkflow
    participant Heat as HeatmapWorkflow
    participant Mis as MissionWorkflow

    Main->>Root: create()
    Root->>Map: new MapController()
    Root->>Loader: loadDataset(projection)
    Loader-->>Root: AdminDataset (tree)
    Root->>Panel: new OperationsPanel()
    Root->>Nav: new NavigationWorkflow(map, dataset)
    Root->>Heat: new HeatmapWorkflow(map, panel)
    Heat->>Panel: registerView(heatmap)
    Root->>Mis: new MissionWorkflow(map, panel)
    Mis->>Panel: registerView(missions, editor, review)
    Root->>Nav: showInitialRoot()
    Root-->>Mis: load() fire and forget
    Root-->>Heat: load() fire and forget
```

## 5. KPI-tiles Pipeline

```mermaid
flowchart LR
    subgraph Server["Backend"]
        Pts["approved points<br/>(active FINALIZED revisions)<br/>snapshot, 5 s TTL"]
        IDW["IDW interpolation<br/>spatial buckets"]
        TC["tile cache<br/>key version:z:x:y"]
        Pts --> IDW --> TC
    end

    subgraph Client["Frontend"]
        Api["HttpSignalQualityApi<br/>Float32Array 64x64"]
        NC["numeric LRU cache<br/>(512, keyed by version)"]
        Wk["worker: LUT colorize<br/>NaN = transparent"]
        Lyr["OL TileLayer"]
        Pal["palette + range<br/>(client-side only)"]
        Api --> NC --> Wk --> Lyr
        Pal -.-> Wk
    end

    TC -- "GET /signal-quality/tiles/z/x/y?v=version<br/>immutable, 1 year cache" --> Api
```

Colors, thresholds and opacity never cross the wire (ADR-0004). A palette edit re-colorizes from the numeric cache without any request.

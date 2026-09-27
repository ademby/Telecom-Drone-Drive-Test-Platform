## Architecture

### 1. System boundaries

```mermaid
flowchart TB
    subgraph Browser["Browser — apps/frontend"]
        direction TB
        NAV["NavigationWorkflow"]
        MIS["MissionWorkflow"]
        HEAT["HeatmapWorkflow"]
        MAPC["MapController<br/>(OL Map, basemap, view helpers)"]
        NAV --> MAPC
        MIS --> MAPC
        HEAT --> MAPC
    end

    subgraph Backend["NestJS backend — apps/backend"]
        direction TB
        MM["MissionModule"]
        MRM["MissionResultModule"]
        SQM["SignalQualityModule"]
        MRM -. "ResultRevisionFinalized event" .-> SQM
    end

    DRONE["Drone (external)<br/>apps/drone-mock in dev"]

    Browser -- "HTTP / REST" --> Backend
    Backend -- "REST: claim / status / result" --> DRONE
    DRONE -- "poll & upload" --> Backend
```

### 2. Backend module dependencies

```mermaid
flowchart LR
    Common["CommonModule<br/>(PrismaService, ApiError, DomainEvents)"]

    Mission["MissionModule"]
    MissionResult["MissionResultModule"]
    SignalQuality["SignalQualityModule"]

    Mission --> Common
    MissionResult --> Common
    SignalQuality --> Common

    SignalQuality -- "imports<br/>(reads approved measurements)" --> MissionResult
    MissionResult -. "emits ResultRevisionFinalized" .-> SignalQuality

    Mission -.- NoDep["no dependency on<br/>MissionResult or SignalQuality"]
    style NoDep fill:none,stroke-dasharray: 3 3
```

### 3. Mission lifecycle

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> PLANNED: plan()
    PLANNED --> DISPATCHED: claim()
    DISPATCHED --> RUNNING: reportStatus(RUNNING)
    RUNNING --> COMPLETED: reportStatus(COMPLETED)
    RUNNING --> FAILED: reportStatus(FAILED)
    PLANNED --> FAILED: MISSED_DISPATCH\n(dispatch sweeper)

    DRAFT --> CANCELLED: cancel()
    PLANNED --> CANCELLED: cancel()

    FAILED --> DRAFT: derive()\nnew draft mission

    COMPLETED --> [*]
    CANCELLED --> [*]
```

### 4. Result finalization → Signal Quality invalidation

```mermaid
sequenceDiagram
    participant Drone
    participant MRC as MissionResultController
    participant MRS as MissionResultService
    participant Events as DomainEvents
    participant SQS as SignalQualityService
    participant Repo as PrismaMissionResultRepository

    Drone->>MRC: POST /missions/:id/result/revisions
    MRC->>MRS: review(missionId, command, key)
    MRS->>Repo: review(missionId, command, key)
    Repo-->>MRS: ResultRevision (finalized?)
    alt command.finalize == true
        MRS->>Events: emitResultRevisionFinalized({missionId})
        Events-->>SQS: onResultRevisionFinalized()
        SQS->>SQS: invalidate() tile cache + points snapshot
    end
    MRS-->>MRC: result
    MRC-->>Drone: 200 OK
```

### 5. Frontend composition and KPI rendering seam

```mermaid
classDiagram
    class CompositionRoot {
        +build()
    }
    class MapController {
        +map: OL.Map
        +basemapManager: BasemapManager
        +fitViewToFeature()
        +fitViewToFeatureHop()
        +hopToView()
    }
    class NavigationWorkflow {
        +load()
        +select()
    }
    class MissionWorkflow {
        +load()
        +select()
    }
    class HeatmapWorkflow {
        +toggle()
        +renderer: SignalQualityRenderer
    }
    class SignalQualityRenderer {
        <<interface>>
    }
    class SignalQualityTileSource
    class SignalQualityTileSource_ForWebGL

    CompositionRoot --> MapController : builds
    CompositionRoot --> NavigationWorkflow : builds (passes MapController)
    CompositionRoot --> MissionWorkflow : builds (passes MapController)
    CompositionRoot --> HeatmapWorkflow : builds (passes MapController)

    NavigationWorkflow --> MapController : adds layers/interactions
    MissionWorkflow --> MapController : adds layers/interactions
    HeatmapWorkflow --> MapController : adds tile layer/legend

    HeatmapWorkflow --> SignalQualityRenderer
    SignalQualityRenderer <|.. SignalQualityTileSource : Canvas (default)
    SignalQualityRenderer <|.. SignalQualityTileSource_ForWebGL : WebGL (retained)
```

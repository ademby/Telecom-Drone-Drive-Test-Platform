# Documentation index

| Document | Read it for |
| -------- | ----------- |
| [`../README.md`](../README.md) | Install, run, scripts |
| [`domain.md`](domain.md) | Ubiquitous language, current decisions, open questions |
| [`architecture/frontend.md`](architecture/frontend.md) | Workflows, composition root, panel, map, renderer, debt list |
| [`architecture/backend.md`](architecture/backend.md) | Modules, endpoints, events, sweeper, tile generation, drone mock |
| [`architecture-diagrams.md`](architecture-diagrams.md) | Mermaid overview diagrams (render on GitHub) |
| [`uml/`](uml/) | PlantUML class, sequence and state diagrams (14 files) |
| [`adr/`](adr/) | Architecture decision records |
| [`future-features.md`](future-features.md) | Deferred product features (SSE, live drone position, more KPIs) |
| [`future-deployment.md`](future-deployment.md) | Production topology backlog |

## ADR index

| ADR | Title | Status |
| --- | ----- | ------ |
| 0001 | Whole platform boundary with separated contexts | Accepted |
| 0002 | Immutable measurements with versioned result revisions | Accepted |
| 0003 | Drone-initiated REST integration | Accepted (auth not implemented) |
| 0004 | Numeric tiles with client-side presentation | Accepted |
| 0005 | Workflows own their map layers and UI | Accepted (extended by 0009, 0010) |
| 0006 | Both Signal Quality renderer adapters behind one interface | Accepted |
| 0007 | Backend feature modules | Accepted (amended by 0012) |
| 0008 | Route-centric missions, backend authority, KPI terminology | Accepted (see 0013) |
| 0009 | Independent workflows and composition root | Accepted |
| 0010 | Generic operations panel host | Accepted |
| 0011 | Heatmap freshness: refresh and advisory | Accepted (interim) |
| 0012 | In-process domain events | Accepted |
| 0013 | Result revision activation rule | **Proposed** |

## Reading order for newcomers

1. `domain.md`, then `architecture-diagrams.md` sections 1 to 2.
2. `architecture/frontend.md` and `uml/0004`, `0009`, `0010`.
3. `architecture/backend.md` and `uml/0013`, `0014`.
4. ADR-0009, ADR-0011, ADR-0013.

## Conventions

- Diagram sources are text (`.puml`, Mermaid); do not commit rendered images.
- Each doc separates **what the code does today** from **what is planned**; planned items live in `future-*.md`.

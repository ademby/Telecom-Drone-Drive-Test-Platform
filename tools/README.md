# Developer tooling

Hierarchy:

```text
tools/
├── clean.mjs, dev.mjs, watch-service.mjs   # lifecycle
├── db/                                     # database / seed
│   ├── podman-db.mjs
│   ├── seed-demo-missions.mts
│   └── seed-signal-quality.mts
└── data-pipeline/                          # generation code + source inputs
    ├── admin-boundaries/
    │   ├── input/                          # source GeoJSON (not committed)
    │   ├── reports/                        # preprocess reports (not runtime)
    │   └── *.py
    └── signal-quality/
        └── generate.py
```

**Source data:** `tools/data-pipeline/*/input/` (or script-local defaults).  
**Generation scripts:** `tools/data-pipeline/`.  
**Generated runtime datasets:** `apps/frontend/public/data/` (boundaries, manifest, signal-quality only). This directory is git-ignored; generate the files before `npm run setup`.  
**DB/seed:** `tools/db/` — `npm run db:*`.

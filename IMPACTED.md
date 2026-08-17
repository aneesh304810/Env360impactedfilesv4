# FINAL BUILD — impacted files + reingest CSV
Your Env360 after this: 4 tabs — Overview (KPIs + cluster board) · Health checks
(live dashboard) · Certificates (horizon + register + unmonitored) · Inventory.
Pulse + old Topology + Network tabs removed. Everything synced to Inventory.

## Overwrite at these paths
ui/src/Environment360.jsx             4-tab shell · HealthTab/CertsTab mounted
ui/src/Environment360_additions.jsx   NetworkBoard v2 (auto-router) + HealthTab
                                      + CertsTab + InventoryTab + Ssl + RulesTbd
ui/src/env360_infra_api_additions.js  envInfraRules etc.
api/app/env_infra_loader.py           rules + 4 cols (hash-stable)
api/app/routers_env_infra.py          + /env-infra/rules
api/app/env_probe_gen.py              K8S pod probes
api/app/env_probe_daemon.py           k8s_check
api/app/env_topology.py               hub-mediated lanes + 6 new NODE_MAP systems
ingestion/env_infra_ingest.py         cols UPDATE + rules MERGE
sql/46_env_network.sql                guarded (run_ts fix included)

## Reingest
sample_artifacts/cp_env_infrastructure_v2.csv   35 rows + 6 new systems x 4 envs
  -> .\load.ps1 env_infra -file sample_artifacts\cp_env_infrastructure_v2.csv
  expect: ~24 added · 0 changed · probes regenerated (hub = K8S kind)

## Order
1. sql/46 (skip if already run; 46b fix included in it)
2. overwrite files above · clear api\app + ingestion __pycache__
3. $env:CP_K8S_TOKEN_DEV=<view-SA token>   (prod URL: env_probe_gen K8S_API)
4. reingest the v2 csv (above)
5. restart uvicorn + daemon · hard refresh UI
6. verify: Overview board shows Momentum/Ping/SaaS on their spots ·
   Health checks live-groups your inventory · Certificates lists route 6d /
   portal 5d / SEI QA 23d + unmonitored-443 section · Inventory 4 new columns
Sparkline note: latency history accumulates client-side per session (no history
endpoint yet — say the word if you want env_probe_result history served).

"""Environment 360 infrastructure inventory — house-pattern router.
Wire: add "routers_env_infra" to the guarded router tuple in main.py.
GET  /env-infra                 rows (grouped by env)
GET  /env-infra/topology?env=   generated topology+probe manifest
GET  /env-infra/tbd             the network-team ask list
GET  /env-infra/export          download the spreadsheet (tsv, Excel-openable)
POST /env-infra/import          upload edited sheet -> diff + merge + hist
"""
import json, os
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import Response

from .env_infra_loader import parse_sheet, export_rows, parse_rules
from .env_topology import build_topology
from .env_probe_gen import generate_probes

try:
    from .db import query
except Exception:                                            # pragma: no cover
    query = None

router = APIRouter(prefix="/env-infra", tags=["environment-360"])

SEL = ("SELECT env, layer, system_name, hosts, sizing_ram, sizing_cpu, "
       "sizing_storage, growth, hosting, direction, protocol_port, notes, "
       "row_hash FROM env_infra")
KEYS = ["env", "layer", "system_name", "hosts", "sizing_ram", "sizing_cpu",
        "sizing_storage", "growth", "hosting", "direction", "protocol_port",
        "notes", "row_hash"]


def _norm(rows, keys):
    """db.query may return tuples OR dicts (house helpers differ) — accept both."""
    out = []
    for r in rows or []:
        if isinstance(r, dict):
            low = { (k.lower() if isinstance(k, str) else k): v for k, v in r.items() }
            out.append({k: ("" if low.get(k) is None else str(low.get(k))) for k in keys})
        else:
            out.append({k: ("" if v is None else str(v)) for k, v in zip(keys, r)})
    return out

def _rows():
    if not query:
        return []
    return _norm(query(SEL), KEYS)

def _exec_many(sql, seq):
    try:
        from .db import execute_many
        execute_many(sql, seq)
        return
    except Exception:
        pass
    import oracledb
    dsn = os.environ["CP_CATALOG_DB_DSN"]
    user, rest = dsn.split("/", 1)
    pwd, host = rest.rsplit("@", 1)
    with oracledb.connect(user=user, password=pwd, dsn=host) as c:
        cur = c.cursor()
        cur.executemany(sql, seq)
        c.commit()

@router.get("")
def all_rows():
    rows = _rows()
    envs = {}
    for r in rows:
        envs.setdefault(r["env"], []).append(r)
    return {"mode": "LIVE" if rows else "EMPTY", "environments": envs,
            "tbd_count": sum(1 for r in rows
                             if "TBD" in (r["protocol_port"] or "TBD").upper())}

@router.get("/topology")
def topology(env: str = "DEV"):
    rows = _rows()
    if not rows:
        raise HTTPException(404, "env_infra empty — import the workbook first")
    if env not in {r["env"] for r in rows}:
        raise HTTPException(404, f"unknown env {env}")
    return build_topology(rows, env)

@router.get("/rules")
def rules(env: str = None, project: str = None):
    """Firewall rulebase (v_env_rulebase auto-upgrades APPROVED->VERIFIED via probes).
    Empty list until sql/46_env_network.sql has been run."""
    if not query:
        return []
    try:
        sql = "SELECT project, env, src_system, dst_system, port_proto, direction, state, notes FROM v_env_rulebase WHERE 1=1"
        args = []
        if env: sql += " AND env=:" + str(len(args)+1); args.append(env)
        if project: sql += " AND project=:" + str(len(args)+1); args.append(project)
        return _norm(query(sql, args),
                     ["project","env","src_system","dst_system","port_proto","direction","state","notes"])
    except Exception:
        return []

@router.get("/tbd")
def tbd():
    return [r for r in _rows()
            if "TBD" in (r["protocol_port"] or "TBD").upper()
            or "TBD" in (r["notes"] or "").upper()]

@router.put("/row")
async def save_row(row: dict):
    """Single-row upsert from the Inventory UI. Writes DB + hist, regenerates
    the probe registry — the workbook stays the export view, never the source."""
    need = ("env", "layer", "system_name")
    if any(not row.get(k) for k in need):
        raise HTTPException(422, f"row needs {need}")
    import hashlib
    keys = ["env", "layer", "system_name", "hosts", "sizing_ram", "sizing_cpu",
            "sizing_storage", "growth", "hosting", "direction", "protocol_port",
            "notes", "ssl_expiry"]
    vals = {k: str(row.get(k, "") or "") for k in keys}
    vals["row_hash"] = hashlib.sha256(json.dumps(
        {k: vals[k] for k in keys}, sort_keys=True).encode()).hexdigest()[:16]
    merge = ("MERGE INTO env_infra t USING (SELECT :env env, :layer layer, "
             ":system_name system_name FROM dual) s "
             "ON (t.env=s.env AND t.layer=s.layer AND t.system_name=s.system_name) "
             "WHEN MATCHED THEN UPDATE SET hosts=:hosts, sizing_ram=:sizing_ram, "
             "sizing_cpu=:sizing_cpu, sizing_storage=:sizing_storage, growth=:growth, "
             "hosting=:hosting, direction=:direction, protocol_port=:protocol_port, "
             "notes=:notes, ssl_expiry=CASE WHEN :ssl_expiry IS NULL OR :ssl_expiry='' "
             "THEN NULL ELSE TO_DATE(:ssl_expiry,'YYYY-MM-DD') END, row_hash=:row_hash, "
             "updated_at=SYSTIMESTAMP, updated_by='ui-row' "
             "WHEN NOT MATCHED THEN INSERT (env, layer, system_name, hosts, sizing_ram, "
             "sizing_cpu, sizing_storage, growth, hosting, direction, protocol_port, notes, "
             "ssl_expiry, row_hash, updated_by) VALUES (:env, :layer, :system_name, :hosts, "
             ":sizing_ram, :sizing_cpu, :sizing_storage, :growth, :hosting, :direction, "
             ":protocol_port, :notes, CASE WHEN :ssl_expiry IS NULL OR :ssl_expiry='' "
             "THEN NULL ELSE TO_DATE(:ssl_expiry,'YYYY-MM-DD') END, :row_hash, 'ui-row')")
    _exec_many(merge, [vals])
    _exec_many("INSERT INTO env_infra_hist (env, layer, system_name, row_hash, "
               "change_kind, snapshot_json, changed_by) VALUES (:1,:2,:3,:4,'CHANGED',:5,'ui-row')",
               [[vals["env"], vals["layer"], vals["system_name"], vals["row_hash"],
                 json.dumps(vals)]])
    return _regen_probes()

@router.delete("/row")
async def delete_row(env: str, layer: str, system_name: str):
    _exec_many("INSERT INTO env_infra_hist (env, layer, system_name, row_hash, "
               "change_kind, snapshot_json, changed_by) "
               "SELECT env, layer, system_name, row_hash, 'REMOVED', '{}', 'ui-row' "
               "FROM env_infra WHERE env=:1 AND layer=:2 AND system_name=:3",
               [[env, layer, system_name]])
    _exec_many("DELETE FROM env_infra WHERE env=:1 AND layer=:2 AND system_name=:3",
               [[env, layer, system_name]])
    return _regen_probes()

def _regen_probes():
    rows = _rows()
    probes = generate_probes(rows)
    _exec_many("DELETE FROM env_probe WHERE 1=1", [[]] or [()])
    if probes:
        _exec_many("INSERT INTO env_probe (probe_id, env, kind, check_type, target_host, "
                   "target_port, state, source_hash) VALUES (:1,:2,:3,:4,:5,:6,:7,:8)",
                   [(p["probe_id"], p["env"], p["kind"], p["check_type"], p["target_host"],
                     p["target_port"], p["state"], p["source_hash"]) for p in probes])
    armed = sum(1 for p in probes if p["state"] == "ARMED")
    return {"ok": True, "probes_regenerated": len(probes), "probes_armed": armed,
            "probes_waiting": len(probes) - armed}

@router.get("/probes")
def probes(env: str = None):
    if not query:
        return []
    sql = ("SELECT probe_id, env, kind, check_type, target_host, target_port, state "
           "FROM env_probe" + (" WHERE env=:1" if env else ""))
    rows = query(sql, [env] if env else [])
    keys = ["probe_id", "env", "kind", "check_type", "target_host", "target_port", "state"]
    return _norm(rows, keys)

@router.get("/probes/live")
def probes_live(env: str = None):
    """latest result per probe — Environment 360's board reads this."""
    if not query:
        return []
    sql = ("SELECT probe_id, env, kind, state, status, latency_ms, detail "
           "FROM v_env_probe_live" + (" WHERE env=:1" if env else ""))
    keys = ["probe_id", "env", "kind", "state", "status", "latency_ms", "detail"]
    return _norm(query(sql, [env] if env else []), keys)

@router.get("/export")
def export():
    rows = _rows()
    if not rows:
        raise HTTPException(404, "env_infra empty")
    return Response(export_rows(rows),
                    media_type="text/tab-separated-values",
                    headers={"Content-Disposition":
                             'attachment; filename="cp_env_infrastructure.tsv"'})

@router.post("/import")
async def import_sheet(file: UploadFile = File(...)):
    data = await file.read()
    try:
        new = parse_sheet(data, file.filename or "upload.tsv")
    except ValueError as e:
        raise HTTPException(422, f"sheet rejected: {e}")
    cur = {(r["env"], r["layer"], r["system_name"]): r for r in _rows()}
    nxt = {(r["env"], r["layer"], r["system_name"]): r for r in new}
    added = [k for k in nxt if k not in cur]
    removed = [k for k in cur if k not in nxt]
    changed = [k for k in nxt if k in cur and cur[k]["row_hash"] != nxt[k]["row_hash"]]
    merge = ("MERGE INTO env_infra t USING (SELECT :env env, :layer layer, "
             ":system_name system_name FROM dual) s "
             "ON (t.env=s.env AND t.layer=s.layer AND t.system_name=s.system_name) "
             "WHEN MATCHED THEN UPDATE SET hosts=:hosts, sizing_ram=:sizing_ram, "
             "sizing_cpu=:sizing_cpu, sizing_storage=:sizing_storage, growth=:growth, "
             "hosting=:hosting, direction=:direction, protocol_port=:protocol_port, "
             "notes=:notes, ssl_expiry=CASE WHEN :ssl_expiry IS NULL OR :ssl_expiry='' "
             "THEN NULL ELSE TO_DATE(:ssl_expiry,'YYYY-MM-DD') END, row_hash=:row_hash, "
             "updated_at=SYSTIMESTAMP, updated_by='ui-import' "
             "WHEN NOT MATCHED THEN INSERT (env, layer, system_name, hosts, sizing_ram, "
             "sizing_cpu, sizing_storage, growth, hosting, direction, protocol_port, notes, "
             "ssl_expiry, row_hash, updated_by) VALUES (:env, :layer, :system_name, :hosts, "
             ":sizing_ram, :sizing_cpu, :sizing_storage, :growth, :hosting, :direction, "
             ":protocol_port, :notes, CASE WHEN :ssl_expiry IS NULL OR :ssl_expiry='' "
             "THEN NULL ELSE TO_DATE(:ssl_expiry,'YYYY-MM-DD') END, :row_hash, 'ui-import')")
    IK = ["env", "layer", "system_name", "hosts", "sizing_ram", "sizing_cpu",
          "sizing_storage", "growth", "hosting", "direction", "protocol_port",
          "notes", "ssl_expiry", "row_hash"]
    seq = [{k: r.get(k, "") for k in IK} for r in new]
    _exec_many(merge, seq)
    hist = ("INSERT INTO env_infra_hist (env, layer, system_name, row_hash, change_kind, "
            "snapshot_json, changed_by) VALUES (:1,:2,:3,:4,:5,:6,'ui-import')")
    hseq = ([(k[0], k[1], k[2], nxt[k]["row_hash"], "ADDED", json.dumps(nxt[k])) for k in added]
          + [(k[0], k[1], k[2], nxt[k]["row_hash"], "CHANGED", json.dumps(nxt[k])) for k in changed]
          + [(k[0], k[1], k[2], cur[k]["row_hash"], "REMOVED", json.dumps(cur[k])) for k in removed])
    if hseq:
        _exec_many(hist, hseq)
    if removed:
        _exec_many("DELETE FROM env_infra WHERE env=:1 AND layer=:2 AND system_name=:3",
                   [list(k) for k in removed])
    # --- AUTO: regenerate the probe registry from the new rows ---
    probes = generate_probes(new)
    _exec_many("DELETE FROM env_probe WHERE 1=1", [[]] or [()])
    _exec_many("INSERT INTO env_probe (probe_id, env, kind, check_type, target_host, "
               "target_port, state, source_hash) VALUES (:1,:2,:3,:4,:5,:6,:7,:8)",
               [(p["probe_id"], p["env"], p["kind"], p["check_type"], p["target_host"],
                 p["target_port"], p["state"], p["source_hash"]) for p in probes])
    armed = sum(1 for p in probes if p["state"] == "ARMED")
    return {"probes_regenerated": len(probes), "probes_armed": armed,
            "probes_waiting": len(probes) - armed,
            "added": len(added), "changed": len(changed), "removed": len(removed),
            "unchanged": len(nxt) - len(added) - len(changed),
            "tbd_count": sum(1 for r in new
                             if "TBD" in (r["protocol_port"] or "TBD").upper()),
            "detail": {"added": [list(k) for k in added],
                       "changed": [list(k) for k in changed],
                       "removed": [list(k) for k in removed]}}

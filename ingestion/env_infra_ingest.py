"""env_infra ingestion step — house pattern (ingestion.run / load.ps1).

Register in ingestion/run.py STEPS:
    from ingestion import env_infra_ingest
    STEPS["env_infra"] = env_infra_ingest.run

Invoke like every other load:
    python -m ingestion.run env_infra                       # sample artifact
    python -m ingestion.run env_infra --file path\\to\\sheet.xlsx
    $env:CP_ENV_WORKBOOK="D:\\drops\\cp_env_infrastructure.xlsx"; .\\load.ps1 env_infra

Resolution order for the workbook path:
    --file arg  >  CP_ENV_WORKBOOK (exact file)  >
    CP_SAMPLE_ARTIFACTS (directory; picks cp_env_infrastructure.tsv/.csv/.xlsx)  >
    repo sample_artifacts/

Same semantics as POST /env-infra/import (one shared behavior, two entry points):
diff vs current rows, MERGE + hist (ADDED/CHANGED/REMOVED), delete removed,
regenerate env_probe (ARMED/WAITING). Malformed sheet -> raises, nothing written.
"""
import json, os, sys

def _default_sample():
    """Resolution: CP_SAMPLE_ARTIFACTS dir (env) > repo sample_artifacts/.
    Within the dir, first of: .tsv / .csv / .xlsx wins."""
    bases = []
    if os.environ.get("CP_SAMPLE_ARTIFACTS"):
        bases.append(os.environ["CP_SAMPLE_ARTIFACTS"])
    bases.append(os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "sample_artifacts"))
    for base in bases:
        for n in ("cp_env_infrastructure.tsv", "cp_env_infrastructure.csv",
                  "cp_env_infrastructure.xlsx"):
            p = os.path.join(base, n)
            if os.path.exists(p):
                return p
    return os.path.join(bases[-1], "cp_env_infrastructure.tsv")

def _loader_bits():
    try:                                        # inside api package layout
        from api.app.env_infra_loader import parse_sheet, parse_rules
        from api.app.env_probe_gen import generate_probes
    except Exception:                           # flat ingestion layout
        from env_infra_loader import parse_sheet, parse_rules
        from env_probe_gen import generate_probes
    return parse_sheet, generate_probes, parse_rules

def _connect():
    try:
        from ingestion.run import _connect as c   # house connection
        return c()
    except Exception:
        import oracledb
        dsn = os.environ["CP_CATALOG_DB_DSN"]
        user, rest = dsn.split("/", 1)
        pwd, host = rest.rsplit("@", 1)
        return oracledb.connect(user=user, password=pwd, dsn=host)

def load(conn, path=None):
    """House step contract: called from ingestion.run with the step's open
    connection. Workbook path resolution: path arg > CP_ENV_WORKBOOK >
    CP_SAMPLE_ARTIFACTS dir > repo sample_artifacts/."""
    path = path or os.environ.get("CP_ENV_WORKBOOK") or _default_sample()
    parse_sheet, generate_probes, parse_rules = _loader_bits()
    print(f"[env_infra] workbook: {path}")
    new = parse_sheet(open(path, "rb").read(), os.path.basename(path))

    cur = conn.cursor()
    cur.execute("SELECT env, layer, system_name, row_hash FROM env_infra")
    current = {(r[0], r[1], r[2]): r[3] for r in cur.fetchall()}
    nxt = {(r["env"], r["layer"], r["system_name"]): r for r in new}
    added = [k for k in nxt if k not in current]
    changed = [k for k in nxt if k in current and current[k] != nxt[k]["row_hash"]]
    removed = [k for k in current if k not in nxt]

    merge = ("MERGE INTO env_infra t USING (SELECT :env env, :layer layer, "
             ":system_name system_name FROM dual) s "
             "ON (t.env=s.env AND t.layer=s.layer AND t.system_name=s.system_name) "
             "WHEN MATCHED THEN UPDATE SET hosts=:hosts, sizing_ram=:sizing_ram, "
             "sizing_cpu=:sizing_cpu, sizing_storage=:sizing_storage, growth=:growth, "
             "hosting=:hosting, direction=:direction, protocol_port=:protocol_port, "
             "notes=:notes, ssl_expiry=CASE WHEN :ssl_expiry IS NULL OR :ssl_expiry='' "
             "THEN NULL ELSE TO_DATE(:ssl_expiry,'YYYY-MM-DD') END, row_hash=:row_hash, "
             "updated_at=SYSTIMESTAMP, updated_by='ingestion' "
             "WHEN NOT MATCHED THEN INSERT (env, layer, system_name, hosts, sizing_ram, "
             "sizing_cpu, sizing_storage, growth, hosting, direction, protocol_port, notes, "
             "ssl_expiry, row_hash, updated_by) VALUES (:env, :layer, :system_name, :hosts, "
             ":sizing_ram, :sizing_cpu, :sizing_storage, :growth, :hosting, :direction, "
             ":protocol_port, :notes, CASE WHEN :ssl_expiry IS NULL OR :ssl_expiry='' "
             "THEN NULL ELSE TO_DATE(:ssl_expiry,'YYYY-MM-DD') END, :row_hash, 'ingestion')")
    KEYS = ["env", "layer", "system_name", "hosts", "sizing_ram", "sizing_cpu",
            "sizing_storage", "growth", "hosting", "direction", "protocol_port",
            "notes", "ssl_expiry", "row_hash"]
    cur.executemany(merge, [{k: r.get(k, "") for k in KEYS} for r in new])

    hist = ("INSERT INTO env_infra_hist (env, layer, system_name, row_hash, "
            "change_kind, snapshot_json, changed_by) VALUES (:1,:2,:3,:4,:5,:6,'ingestion')")
    hseq = ([(k[0], k[1], k[2], nxt[k]["row_hash"], "ADDED", json.dumps(nxt[k]))
             for k in added]
          + [(k[0], k[1], k[2], nxt[k]["row_hash"], "CHANGED", json.dumps(nxt[k]))
             for k in changed]
          + [(k[0], k[1], k[2], current[k], "REMOVED", "{}") for k in removed])
    if hseq:
        cur.executemany(hist, hseq)
    if removed:
        cur.executemany("DELETE FROM env_infra WHERE env=:1 AND layer=:2 "
                        "AND system_name=:3", [list(k) for k in removed])

    probes = generate_probes(new)
    cur.execute("DELETE FROM env_probe")
    cur.executemany("INSERT INTO env_probe (probe_id, env, kind, check_type, "
                    "target_host, target_port, state, source_hash) "
                    "VALUES (:1,:2,:3,:4,:5,:6,:7,:8)",
                    [(p["probe_id"], p["env"], p["kind"], p["check_type"],
                      p["target_host"], p["target_port"], p["state"],
                      p["source_hash"]) for p in probes])
    # ---- enhancement: project/zone/component (no-op until SQL 46 is run) ----
    try:
        cur.executemany(
            "UPDATE env_infra SET project=:project, zone=:zone, component=:component, "
            "display_order=:display_order "
            "WHERE env=:env AND layer=:layer AND system_name=:system_name",
            [{"project": r.get("project", "SEI"), "zone": r.get("zone", ""),
              "component": r.get("component", ""), "display_order": r.get("display_order"),
              "env": r["env"],
              "layer": r["layer"], "system_name": r["system_name"]} for r in new])
    except Exception as e:
        print(f"[env_infra] classification columns skipped ({type(e).__name__}) "
              f"- run sql/46_env_network.sql to enable")
    # ---- enhancement: firewall rules from the same sheet (Layer=Rule rows) ----
    n_rules = 0
    try:
        rules = parse_rules(open(path, "rb").read(), os.path.basename(path))
        if rules:
            cur.executemany(
                "MERGE INTO env_rule t USING (SELECT :project project, :env env, "
                ":src_system src_system, :dst_system dst_system, :port_proto port_proto "
                "FROM dual) s ON (t.project=s.project AND t.env=s.env AND "
                "t.src_system=s.src_system AND t.dst_system=s.dst_system AND "
                "t.port_proto=s.port_proto) "
                "WHEN MATCHED THEN UPDATE SET direction=:direction, "
                "state=CASE WHEN t.state='VERIFIED' THEN t.state ELSE :state END, "
                "notes=:notes, updated_at=SYSTIMESTAMP, updated_by='ingestion' "
                "WHEN NOT MATCHED THEN INSERT (project, env, src_system, dst_system, "
                "port_proto, direction, state, notes, updated_by) VALUES "
                "(:project, :env, :src_system, :dst_system, :port_proto, :direction, "
                ":state, :notes, 'ingestion')",
                [{**r, "env": "DEV" if not r.get("env") else r["env"]} for r in rules])
            n_rules = len(rules)
    except Exception as e:
        print(f"[env_infra] rules skipped ({type(e).__name__}) "
              f"- run sql/46_env_network.sql to enable")
    conn.commit()
    armed = sum(1 for p in probes if p["state"] == "ARMED")
    if n_rules:
        print(f"[env_infra] rules: {n_rules} upserted to env_rule (VERIFIED preserved)")
    print(f"[env_infra] rows: +{len(added)} ~{len(changed)} -{len(removed)} "
          f"(unchanged {len(nxt)-len(added)-len(changed)}) · "
          f"probes: {len(probes)} regenerated, {armed} ARMED, "
          f"{len(probes)-armed} WAITING")
    return {"added": len(added), "changed": len(changed), "removed": len(removed),
            "probes": len(probes), "armed": armed}


def run(args=None):
    """Standalone CLI: python -m ingestion.env_infra_ingest [--file X]."""
    args = args or []
    path = args[args.index("--file") + 1] if "--file" in args else None
    return load(_connect(), path)


if __name__ == "__main__":
    run(sys.argv[1:])

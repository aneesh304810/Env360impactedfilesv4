"""Parse the SEI infrastructure workbook (tsv/csv/xlsx) into env-tagged rows.

Environment detection: the sheet has no env column — blocks are implicit.
A new block starts at each (Layer=Platform, System=CP Integration Hub) row,
in canonical order DEV, SIT, TRIAL_UAT, PROD. Trailing External API/SFTP rows
are shared: qcsecureftp -> lower envs, secureftp -> PROD, API egress -> all.
"""
import csv, hashlib, io, json

ENV_ORDER = ["DEV", "SIT", "TRIAL_UAT", "PROD"]
COLS = ["Layer", "System", "New_SEI_Hosts_or_Endpoint", "Sizing_RAM", "Sizing_CPU",
        "Sizing_Storage_or_Capacity", "Growth", "Hosting", "Direction",
        "Protocol_Port", "Status_or_Notes", "SSL_Expiry"]

def _rows_from_bytes(data: bytes, filename: str):
    name = (filename or "").lower()
    if name.endswith(".xlsx"):
        import openpyxl                                    # optional dep
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True)
        ws = wb.active
        it = ws.iter_rows(values_only=True)
        header = [str(c or "").strip() for c in next(it)]
        for r in it:
            yield {header[i]: ("" if r[i] is None else str(r[i]).strip())
                   for i in range(min(len(header), len(r)))}
    else:
        text = data.decode("utf-8-sig")
        delim = "\t" if "\t" in text.splitlines()[0] else ","
        for rec in csv.DictReader(io.StringIO(text), delimiter=delim):
            yield {k.strip(): (v or "").strip() for k, v in rec.items() if k}

def _hash(d):
    return hashlib.sha256(json.dumps(d, sort_keys=True).encode()).hexdigest()[:16]

LAST_RULES = []          # rule rows captured by the most recent parse_sheet call

def _is_rule(row):
    return (row.get("Layer") or "").strip().lower() == "rule"

def parse_rules(data, filename="sheet"):
    """Rule rows from the combined sheet: Layer=Rule, System=src, Hosts=dst,
    Protocol_Port=port, Direction, Status_or_Notes=notes, Project/State trailing."""
    out = []
    for row in _rows_from_bytes(data, filename):
        if not _is_rule(row):
            continue
        st = (row.get("State") or "").strip().upper() or "TBD"
        out.append({"project": (row.get("Project") or "SEI").strip() or "SEI",
                    "src_system": (row.get("System") or "").strip(),
                    "dst_system": (row.get("New_SEI_Hosts_or_Endpoint")
                                   or row.get("Hosts") or "").strip(),
                    "port_proto": (row.get("Protocol_Port") or "TBD").strip(),
                    "direction": (row.get("Direction") or "").strip().lower(),
                    "state": st if st in ("TBD", "APPROVED") else "TBD",
                    "notes": (row.get("Status_or_Notes") or row.get("Notes") or "").strip()})
    return out

def parse_sheet(data: bytes, filename: str = "infra.tsv"):
    """-> list of dicts with env + normalized columns + row_hash. Raises ValueError."""
    out, env_idx, seen_platform = [], -1, False
    raw = list(_rows_from_bytes(data, filename))
    if not raw:
        raise ValueError("empty sheet")
    missing = [c for c in ("Layer", "System") if c not in raw[0]]
    if missing:
        raise ValueError(f"missing required columns: {missing}")
    global LAST_RULES
    LAST_RULES = [r for r in raw if _is_rule(r)]
    raw = [r for r in raw if not _is_rule(r)]
    for rec in raw:
        layer, system = rec.get("Layer", ""), rec.get("System", "")
        if not layer:
            continue
        if layer == "Platform" and "Integration Hub" in system:
            env_idx += 1
            if env_idx >= len(ENV_ORDER):
                raise ValueError("more Platform blocks than known environments")
        if layer.startswith("External"):
            hosts = rec.get("New_SEI_Hosts_or_Endpoint", "")
            if "secureftp" in hosts and "qc" not in hosts:
                envs = ["PROD"]
            elif "qcsecureftp" in hosts:
                envs = ["DEV", "SIT", "TRIAL_UAT"]
            else:
                envs = ENV_ORDER[:]                        # API egress: all
        else:
            if env_idx < 0:
                raise ValueError("data row before first Platform block")
            envs = [ENV_ORDER[env_idx]]
        for env in envs:
            row = {"env": env, "layer": layer, "system_name": system,
                   "hosts": rec.get("New_SEI_Hosts_or_Endpoint", ""),
                   "sizing_ram": rec.get("Sizing_RAM", ""),
                   "sizing_cpu": rec.get("Sizing_CPU", ""),
                   "sizing_storage": rec.get("Sizing_Storage_or_Capacity", ""),
                   "growth": rec.get("Growth", ""), "hosting": rec.get("Hosting", ""),
                   "direction": rec.get("Direction", ""),
                   "protocol_port": rec.get("Protocol_Port", ""),
                   "notes": rec.get("Status_or_Notes", ""),
                   "ssl_expiry": rec.get("SSL_Expiry", "")}
            row["row_hash"] = _hash(row)          # hash EXCLUDES the 3 new
            row["project"] = (rec.get("Project") or "SEI").strip().upper() or "SEI"
            row["zone"] = (rec.get("Zone") or "").strip().upper()
            row["component"] = (rec.get("Component") or "").strip().upper()
            do = (rec.get("Display_Order") or "").strip()
            row["display_order"] = int(do) if do.isdigit() else None
            out.append(row)
    envs_seen = {r["env"] for r in out}
    if envs_seen != set(ENV_ORDER):
        raise ValueError(f"expected 4 environments, detected: {sorted(envs_seen)}")
    return out

def export_rows(rows):
    """rows (as stored) -> TSV bytes in the original workbook column order."""
    buf = io.StringIO()
    w = csv.writer(buf, delimiter="\t", lineterminator="\n")
    w.writerow(COLS)
    keymap = ["layer", "system_name", "hosts", "sizing_ram", "sizing_cpu",
              "sizing_storage", "growth", "hosting", "direction", "protocol_port", "notes", "ssl_expiry"]
    order = {e: i for i, e in enumerate(ENV_ORDER)}
    for r in sorted(rows, key=lambda r: (order.get(r["env"], 9), r["layer"] != "Platform")):
        if r["layer"].startswith("External") and r["env"] != (
                "PROD" if "qc" not in r["hosts"] else "DEV"):
            continue                                        # emit shared rows once
        w.writerow([r.get(k, "") for k in keymap])
    return buf.getvalue().encode()

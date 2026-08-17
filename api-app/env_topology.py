"""Generate the Environment 360 topology + probe manifest for one env
from env_infra rows — the JSON contract the NOC view renders."""
import re

NODE_MAP = [   # (layer, system-substring) -> node id, zone, icon
    (("Platform", "Integration Hub"), ("app.hub", "CP INTEGRATION HUB · OPENSHIFT", "⚙️")),
    (("File System", "Landing"), ("dmz.cifs", "DMZ · MFT / EGRESS", "🗄")),
    (("Database", "IMDS"), ("data.imds", "DATA ZONE", "🛢")),
    (("Database", "PBDW"), ("data.pbdw", "DATA ZONE", "🛢")),
    (("Consumer", "Pivotal"), ("cons.piv", "CONSUMERS", "🏢")),
    (("Consumer", "Client Portal"), ("cons.portal", "CONSUMERS", "🖥")),
    (("Consumer", "CRD"), ("cons.vendor", "CONSUMERS", "☁️")),
    (("Consumer", "PORT"), ("cons.vendor", "CONSUMERS", "☁️")),
    (("External SFTP", "SFTP"), ("dmz.mft", "DMZ · MFT / EGRESS", "📥")),
    (("Platform", "Momentum"), ("dmz.momentum", "DMZ · MFT / EGRESS", "⚙")),
    (("Platform", "PingFederate"), ("corp.ping", "CORP · USERS / IDENTITY", "🔐")),
    (("Platform", "OCP Ingress"), ("app.ingress", "CP INTEGRATION HUB · OPENSHIFT", "🌐")),
    (("Platform", "Observability"), ("mgmt.stack", "CORP · USERS / IDENTITY", "📊")),
    (("External API", "SEI SWP Platform"), ("ext.sei", "EXTERNAL", "☁")),
    (("External API", "SEI SaaS"), ("ext.saas", "EXTERNAL", "☁")),
    (("External API", "Proxy Egress"), ("egr.allowlist", "EXTERNAL", "🌐")),
]
LANES = [   # from, to, rule-source: which row's protocol_port governs the crossing
    ("sei-mft",     "ext.sei",   "dmz.mft",    "dmz.mft"),
    ("mft-cifs",    "dmz.mft",   "dmz.cifs",   None),
    ("cifs-hub",    "dmz.cifs",  "app.hub",    "dmz.cifs"),
    ("hub-imds",    "app.hub",   "data.imds",  "data.imds"),
    ("hub-pbdw",    "app.hub",   "data.pbdw",  "data.pbdw"),
    ("pbdw-piv",    "data.pbdw", "cons.piv",   "cons.piv"),
    ("pbdw-portal", "data.pbdw", "cons.portal","cons.portal"),
    ("out-apigee",  "app.hub",   "dmz.apigee", None),
    ("apigee-sei",  "dmz.apigee","ext.seiapi", "egr.allowlist"),
    ("apigee-vendor","dmz.apigee","cons.vendor","cons.vendor"),
]

def _port_of(pp):
    if not pp or "TBD" in pp.upper():
        return None, True
    m = re.search(r"(\d{2,5})", pp)
    return (m.group(1) if m else pp), False

AUTO_ZONE = {"Database": ("data", "DATA ZONE", "🛢", "app.hub"),
             "Consumer": ("cons", "CONSUMERS", "🔹", "data.pbdw"),
             "File System": ("dmz", "DMZ · MFT / EGRESS", "🗄", "app.hub"),
             "Platform": ("app", "CP INTEGRATION HUB · OPENSHIFT", "⚙️", "corp.f5"),
             "External API": ("ext", "EXTERNAL", "🌐", "dmz.apigee"),
             "External SFTP": ("ext", "EXTERNAL", "🌐", "dmz.mft")}

def _slug(name):
    return re.sub(r"[^a-z0-9]+", "", name.lower())[:16]

def build_topology(rows, env):
    ers = [r for r in rows if r["env"] == env]
    nodes, by_id = [], {}
    for r in ers:
        for (layer, frag), (nid, zone, icon) in NODE_MAP:
            if r["layer"] == layer and frag in r["system_name"]:
                n = by_id.get(nid)
                sub = r["hosts"][:90]
                sizing = " · ".join(x for x in (r["sizing_ram"], r["sizing_cpu"]
                          and r["sizing_cpu"] + "c", r["sizing_storage"]) if x)[:60]
                if n:                       # CRD+PORT share cons.vendor
                    n["sub"] += " | " + r["system_name"]
                else:
                    by_id[nid] = {"id": nid, "zone": zone, "icon": icon,
                                  "title": r["system_name"], "sub": sub,
                                  "sizing": sizing, "hosting": r["hosting"],
                                  "probe": nid, "tbd": "TBD" in (r["notes"] or "").upper()
                                             or "TBD" in (r["protocol_port"] or "TBD").upper()}
                    nodes.append(by_id[nid])
    port_by_node = {}
    for r in ers:
        for (layer, frag), (nid, _, _) in NODE_MAP:
            if r["layer"] == layer and frag in r["system_name"]:
                port_by_node.setdefault(nid, r.get("protocol_port", ""))
    lanes = []
    for lid, a, b, src in LANES:
        port, tbd = _port_of(port_by_node.get(src, "") if src else "internal")
        lanes.append({"id": lid, "from": a, "to": b,
                      "rule": port or "TBD", "tbd": tbd, "probe": "path." + lid})
    allowlists = [
        {"id": "al_in", "edge": "sei-mft", "direction": "inbound",
         "label": "SEI source IPs @ BBH MFT",
         "detail": next((r["hosts"] for r in ers if r["layer"] == "External SFTP"), ""),
         "state": "REQUESTED"},
        {"id": "al_out", "edge": "apigee-sei", "direction": "egress",
         "label": "BBH egress ranges @ SEI",
         "detail": next((r["hosts"] for r in ers if "Proxy Egress" in r["system_name"]), ""),
         "state": "REQUESTED"},
    ]
    # ---- dynamic fallback: rows the catalog doesn't know become auto components ----
    known = set()
    for r in ers:
        for (layer, frag), _ in NODE_MAP:
            if r["layer"] == layer and frag in r["system_name"]:
                known.add((r["layer"], r["system_name"]))
    for r in ers:
        if (r["layer"], r["system_name"]) in known or r["layer"] not in AUTO_ZONE:
            continue
        pfx, zone, icon, src = AUTO_ZONE[r["layer"]]
        nid = f"{pfx}.{_slug(r['system_name'])}"
        port, tbd = _port_of(r.get("protocol_port"))
        nodes.append({"id": nid, "zone": zone, "icon": icon, "auto": True,
                      "title": r["system_name"], "sub": r["hosts"][:90],
                      "sizing": "", "hosting": r["hosting"], "probe": nid, "tbd": tbd})
        lanes.append({"id": f"{_slug(r['system_name'])}-auto", "from": src, "to": nid,
                      "rule": port or "TBD", "tbd": tbd, "auto": True,
                      "probe": f"path.{_slug(r['system_name'])}-auto"})
    asks = [{"where": r["layer"] + " · " + r["system_name"], "what": r["protocol_port"] or "port TBD",
             "note": r["notes"]} for r in ers
            if "TBD" in (r.get("protocol_port") or "TBD").upper()]
    return {"env": env, "nodes": nodes, "lanes": lanes,
            "allowlists": allowlists, "asks": asks}

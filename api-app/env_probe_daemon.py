"""Environment 360 probe daemon — no Airflow needed.
Runs the pulse every N minutes as a plain Python process.

    python env_probe_daemon.py                     # every 5 min, all envs
    python env_probe_daemon.py --interval 180      # every 3 min
    python env_probe_daemon.py --env DEV --once    # single cycle (cron-friendly)

Needs: oracledb + CP_CATALOG_DB_DSN=user/pwd@host:port/service (same as the API).
Run it anywhere that can reach the probe targets: `nohup ... &` on a utility box,
a second container in the API pod, or an OpenShift Deployment (1 replica).
Stops cleanly on Ctrl-C / SIGTERM. Each cycle is independent — a crash or
restart loses nothing (results are append-only)."""
import argparse, os, signal, socket, ssl, sys, time
from datetime import datetime

RUNNING = True
def _stop(*_):    # graceful shutdown
    global RUNNING
    RUNNING = False

def tcp_check(host, port, timeout=3.0):
    t0 = time.time()
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            ms = int((time.time() - t0) * 1000)
            return ("WARN" if ms > 1500 else "OK"), ms, "connect ok", None
    except socket.timeout:
        return "DOWN", int(timeout * 1000), "timeout", None
    except OSError as e:
        return "DOWN", int((time.time() - t0) * 1000), str(e)[:120], None

def cert_check(host, port, timeout=4.0):
    t0 = time.time()
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        with socket.create_connection((host, int(port)), timeout=timeout) as sk:
            with ctx.wrap_socket(sk, server_hostname=host) as tls:
                der = tls.getpeercert(binary_form=True)
                not_after = None
                if der:
                    try:                                  # best-effort expiry parse
                        import ssl as _s
                        cert = _s.DER_cert_to_PEM_cert(der)
                        not_after = "present"             # deep parse when cryptography lib present
                        try:
                            from cryptography import x509
                            not_after = x509.load_pem_x509_certificate(
                                cert.encode()).not_valid_after_utc.date().isoformat()
                        except Exception:
                            pass
                    except Exception:
                        pass
                ms = int((time.time() - t0) * 1000)
                return "OK", ms, "tls handshake ok", not_after
    except Exception as e:
        return "DOWN", int((time.time() - t0) * 1000), str(e)[:120], None


def k8s_check(api_url, namespace, token, timeout=6.0):
    """Pod-readiness probe: hub liveness = every deployment in the namespace
    ready. Uses the cluster API (OCPQ for DEV/QC namespaces, the prod OCP
    cluster for PROD). token = service-account token with view role."""
    import json as _json, urllib.request, ssl as _ssl, time as _t
    t0 = _t.time()
    try:
        ctx = _ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = _ssl.CERT_NONE          # cluster CA optional; view-only call
        req = urllib.request.Request(
            f"{api_url}/apis/apps/v1/namespaces/{namespace}/deployments",
            headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            items = _json.loads(r.read()).get("items", [])
        bad = []
        for d in items:
            want = d.get("spec", {}).get("replicas", 0) or 0
            ready = d.get("status", {}).get("readyReplicas", 0) or 0
            if want and ready < want:
                bad.append(f"{d['metadata']['name']} {ready}/{want}")
        ms = int((_t.time() - t0) * 1000)
        if bad:
            return "DOWN", ms, "pods not ready: " + "; ".join(bad[:4]), None
        return "OK", ms, f"{len(items)} deployments ready", None
    except Exception as e:
        return "DOWN", int((_t.time() - t0) * 1000), str(e)[:120], None

def _connect():
    import oracledb
    dsn = os.environ["CP_CATALOG_DB_DSN"]
    user, rest = dsn.split("/", 1)
    pwd, host = rest.rsplit("@", 1)
    return oracledb.connect(user=user, password=pwd, dsn=host)

def cycle(env=None):
    """One pulse: read ARMED probes, check, write results. Returns count."""
    with _connect() as c:
        cur = c.cursor()
        sql = ("SELECT probe_id, check_type, target_host, target_port "
               "FROM env_probe WHERE state = 'ARMED'")
        cur.execute(sql + (" AND env = :1" if env else ""), [env] if env else [])
        probes = cur.fetchall()
        results = []
        for pid, ctype, host, port in probes:
            if not host or not port:
                results.append((pid, "SKIP", None, "no target", None))
                continue
            if str(ctype).upper().startswith("K8S"):
                ns = str(ctype).split(":", 1)[1] if ":" in str(ctype) else ""
                tok = os.environ.get("CP_K8S_TOKEN_" + pid.split(".")[0], os.environ.get("CP_K8S_TOKEN", ""))
                st, ms, detail, na = k8s_check(host, ns, tok)
            elif int(port) == 443:
                st, ms, detail, na = cert_check(host, port)
            else:
                st, ms, detail, na = tcp_check(host, port)
            results.append((pid, st, ms, f"{ctype}: {detail}", na))
        cur.executemany(
            "INSERT INTO env_probe_result (probe_id, status, latency_ms, detail, "
            "cert_not_after) VALUES (:pid, :st, :ms, :dt, "
            "CASE WHEN :na IS NULL THEN NULL ELSE TO_DATE(:na,'YYYY-MM-DD') END)",
            [{"pid": r[0], "st": r[1], "ms": r[2], "dt": r[3],
              "na": r[4] if r[4] and r[4] != "present" else None}
             for r in results])
        c.commit()
        return len(results)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--interval", type=int, default=300, help="seconds between cycles")
    ap.add_argument("--env", help="only this environment")
    ap.add_argument("--once", action="store_true", help="single cycle then exit")
    a = ap.parse_args()
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    print(f"[env360-daemon] start · interval={a.interval}s · env={a.env or 'ALL'}",
          flush=True)
    while RUNNING:
        t0 = time.time()
        try:
            n = cycle(a.env)
            print(f"[env360-daemon] {datetime.now():%H:%M:%S} pulse ok · "
                  f"{n} probes · {int((time.time()-t0)*1000)}ms", flush=True)
        except Exception as e:                      # never die on one bad cycle
            print(f"[env360-daemon] {datetime.now():%H:%M:%S} cycle FAILED: {e}",
                  file=sys.stderr, flush=True)
        if a.once:
            break
        # sleep in 1s slices so SIGTERM lands quickly
        for _ in range(a.interval):
            if not RUNNING:
                break
            time.sleep(1)
    print("[env360-daemon] stopped cleanly", flush=True)

if __name__ == "__main__":
    main()

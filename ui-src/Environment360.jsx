import React, { useState, useEffect } from "react";
import { api } from "./api.js";
import { InventoryTab, SslSummaryCards, NetworkBoard, RulesTbdCard, HealthTab, CertsTab } from "./Environment360_additions";

// =====================================================================
// Environment 360 — certificates · health · topology · pulse
// Five tabs mirroring environment360_mockup.html. DEMO→LIVE via api.js.
// Props: t (theme)
// =====================================================================

const C = { ok: "#159943", okbg: "#d0ebd9", warn: "#e67e22", warnbg: "#fae5d3",
  bad: "#c1113a", badbg: "#f3d2d7", info: "#0091bf", infobg: "#e0f5fd",
  grey: "#dfe6e9", sub: "#666", navy: "#10193b" };
const mono = { fontFamily: "Roboto Mono, Consolas, monospace" };
const stTone = (s) => s === "OK" ? ["ok", C.okbg, C.ok]
  : s === "WARN" ? ["warn", C.warnbg, C.warn]
  : s === "FAIL" ? ["bad", C.badbg, C.bad] : ["none", C.grey, C.sub];

function Chip({ tone, children }) {
  const m = { green: [C.okbg, C.ok], amber: [C.warnbg, C.warn],
    red: [C.badbg, C.bad], blue: [C.infobg, C.info], grey: [C.grey, C.sub] };
  const [bg, fg] = m[tone] || m.grey;
  return <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 8px",
    borderRadius: 999, whiteSpace: "nowrap", background: bg,
    color: fg }}>{children}</span>;
}

function Panel({ t, title, right, children }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${t.border}`,
      borderRadius: 3, boxShadow: "0 3px 5px rgba(0,0,0,.08)",
      marginBottom: 13, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10,
        padding: "8px 13px", borderBottom: `1px solid ${t.panel2}`,
        background: "#fafcfc" }}>
        <h2 style={{ fontSize: 11.5, textTransform: "uppercase",
          margin: 0 }}>{title}</h2>
        <span style={{ marginLeft: "auto" }}>{right}</span>
      </div>
      {children}
    </div>);
}

const DaysBar = ({ days }) => {
  const pct = Math.max(3, Math.min(100, Math.round(((days || 0) / 90) * 100)));
  const col = days == null ? C.sub : days <= 7 ? C.bad
    : days <= 30 ? C.warn : C.ok;
  return (
    <span>
      <span style={{ display: "inline-block", width: 90, height: 7,
        background: C.grey, borderRadius: 4, verticalAlign: "middle",
        marginRight: 7 }}>
        <i style={{ display: "block", height: 7, borderRadius: 4,
          width: `${pct}%`, background: col }} /></span>
      <b style={{ color: col }}>{days == null ? "—" : days}</b>
    </span>);
};

const Strip = ({ cells }) => (
  <span style={{ display: "inline-flex", gap: 1.5, verticalAlign: "middle" }}>
    {(cells || []).slice(-30).map((c, i) => (
      <span key={i} style={{ width: 4, height: 14, borderRadius: 1,
        background: c === "OK" ? C.ok : c === "WARN" ? C.warn
          : c === "FAIL" ? C.bad : C.grey }} />))}
  </span>);

/* ------------------------------------------------------------------ */

export default function Environment360({ t }) {
  const [tab, setTab] = useState("overview");
  const [ov, setOv] = useState(null);
  const [certs, setCerts] = useState(null);
  const [health, setHealth] = useState(null);
  const [topo, setTopo] = useState(null);
  const [pulse, setPulse] = useState(null);
  const [running, setRunning] = useState(false);

  const refresh = () => {
    api.envOverview().then(setOv);
    api.envCerts().then(setCerts);
    api.envHealth().then(setHealth);
    api.envPulse().then(setPulse);
  };
  useEffect(() => { refresh(); }, []);

  const runPulse = () => {
    setRunning(true);
    api.envRunPulse().then(() => { setRunning(false); refresh(); })
      .catch(() => setRunning(false));
  };
  const scanCerts = () => api.envScanCerts().then(refresh);

  const tabs = [["overview", "Overview"],
    ["certs", "Certificates"],
    ["health", "Health checks"], ["inventory", "Inventory"]];

  return (
    <div>
      <div style={{ display: "flex", gap: 2, borderBottom:
        `1px solid ${t.panel2}`, marginBottom: 13 }}>
        {tabs.map(([k, label]) => (
          <div key={k} onClick={() => setTab(k)}
            style={{ padding: "7px 15px", fontSize: 12.5, cursor: "pointer",
              color: tab === k ? t.navy : t.sub,
              fontWeight: tab === k ? 700 : 400,
              borderBottom: tab === k ? `2px solid ${t.pop}` : "none" }}>
            {label}</div>))}
      </div>
      {tab === "overview" && <Overview t={t} ov={ov} onDrill={() => setTab("certs")} />}
      {tab === "certs" && <CertsTab t={t} />}
      {tab === "health" && <HealthTab t={t} />}
      {tab === "inventory" && <InventoryTab t={t} onChanged={refresh} />}
    </div>);
}

/* ---------------- overview ---------------- */

function Overview({ t, ov, onDrill }) {
  if (!ov || ov.error) return <Load err={ov && ov.error} />;
  const k = ov.kpis || {};
  const groups = {};
  (ov.checks || []).forEach((c) => {
    (groups[c.env_group] = groups[c.env_group] || []).push(c);
  });
  const kpi = (label, val, tone) => (
    <div style={{ background: "#fff", border: `1px solid ${t.border}`,
      borderRadius: 3, padding: "10px 13px", textAlign: "center",
      borderTop: `3px solid ${tone}` }}>
      <b style={{ display: "block", fontSize: 23, color: t.navy }}>{val}</b>
      <span style={{ fontSize: 10, textTransform: "uppercase",
        letterSpacing: ".05em", color: t.sub }}>{label}</span>
    </div>);
  return (
    <div>
      {(ov.critical_certs || []).map((c) => (
        <div key={c.endpoint} style={{ display: "flex", gap: 12,
          alignItems: "center", background: C.badbg,
          border: "1px solid #e8b3c0", borderLeft: `4px solid ${C.bad}`,
          borderRadius: 3, padding: "9px 14px", marginBottom: 13,
          fontSize: 12 }}>
          {"🔴"} <b>SSL expiring in {c.days} days:</b>
          <span style={{ ...mono, fontSize: 11 }}>{c.endpoint}</span>
          <span style={{ color: t.sub }}>{c.used_by}</span>
          {c.ticket_url && <a href={c.ticket_url} style={{ marginLeft: "auto",
            fontSize: 11 }}>renewal ticket ↗</a>}
        </div>))}
      <div style={{ display: "grid",
        gridTemplateColumns: "repeat(7,1fr)", gap: 11, marginBottom: 13 }}>
        {kpi("monitored", k.monitored || 0, C.ok)}
        {kpi("healthy now", k.healthy || 0, C.ok)}
        {kpi("degraded", (k.degraded || 0) + (k.failed || 0),
          k.degraded || k.failed ? C.warn : C.ok)}
        {kpi("certs ≤ 7 days", k.certs_7d || 0,
          k.certs_7d ? C.bad : C.ok)}
        {kpi("certs ≤ 30 days", k.certs_30d || 0,
          k.certs_30d ? C.warn : C.ok)}
        <RulesTbdCard t={t} />
        <SslSummaryCards t={t} onDrill={onDrill} />
      </div>
      <div style={{ display: "grid",
        gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
        {Object.keys(groups).map((g) => (
          <div key={g} style={{ background: "#fff",
            border: `1px solid ${t.border}`, borderRadius: 6,
            overflow: "hidden" }}>
            <div style={{ padding: "9px 13px", color: "#fff",
              fontWeight: 700, fontSize: 12.5, background: t.accent }}>
              {g}</div>
            {groups[g].map((c) => {
              const [, , fg] = stTone(c.status);
              return (
                <div key={c.check_id} style={{ display: "flex", gap: 8,
                  alignItems: "center", padding: "6px 13px", fontSize: 11.5,
                  borderTop: "1px solid #eef1f4" }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%",
                    background: fg, flexShrink: 0 }} />
                  <span style={{ ...mono, fontSize: 10.5, flex: 1,
                    overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap" }}>{c.name}</span>
                  {c.status !== "OK" && c.status &&
                    <Chip tone={c.status === "WARN" ? "amber" : "red"}>
                      {c.detail || c.status}</Chip>}
                  <span style={{ ...mono, fontSize: 10, color: t.sub }}>
                    {c.latency_ms != null ? `${c.latency_ms}ms` : ""}</span>
                </div>);
            })}
          </div>))}
      </div>
      <NetworkBoard t={t} />
    </div>);
}

/* ---------------- certificates ---------------- */

function Certs({ t, certs, onScan }) {
  if (!certs || certs.error) return <Load err={certs && certs.error} />;
  const rows = certs.certs || [];
  const crit = rows.filter((r) => r.days_left != null && r.days_left <= 7);
  const warn = rows.filter((r) => r.days_left > 7 && r.days_left <= 30);
  const th = { textAlign: "left", fontSize: 9.5, textTransform: "uppercase",
    letterSpacing: ".04em", color: t.sub, padding: "7px 13px",
    borderBottom: `1.5px solid ${t.panel2}`, background: "#fafcfc" };
  const td = { padding: "7px 13px", borderBottom: "1px solid #eef1f4" };
  return (
    <Panel t={t} title={`Certificates · ${rows.length}`}
      right={<span style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {crit.length > 0 && <Chip tone="red">{crit.length} critical ≤7d</Chip>}
        {warn.length > 0 && <Chip tone="amber">{warn.length} warning ≤30d</Chip>}
        <button onClick={onScan} style={{ height: 26, background: "#fff",
          color: t.accent, border: `1px solid ${t.border}`, borderRadius: 2,
          fontSize: 11, padding: "0 10px", cursor: "pointer" }}>
          {"⟳"} Scan live chains now</button>
      </span>}>
      <table style={{ borderCollapse: "collapse", width: "100%",
        fontSize: 11.5 }}>
        <thead><tr><th style={th}>endpoint</th><th style={th}>CN</th>
          <th style={th}>issuer</th><th style={th}>expires</th>
          <th style={th}>days left</th><th style={th}>used by</th>
          <th style={th}>owner</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.cert_id} style={{ background:
              r.days_left != null && r.days_left <= 7 ? "#fff5f7"
              : r.days_left <= 30 ? "#fffaf4" : "transparent" }}>
              <td style={{ ...td, ...mono, fontSize: 10.5 }}>{r.endpoint}
                {r.scan_error && <Chip tone="red">scan failed</Chip>}</td>
              <td style={{ ...td, ...mono, fontSize: 10.5 }}>{r.cn || "—"}</td>
              <td style={td}>{r.issuer || "—"}</td>
              <td style={{ ...td, ...mono, fontSize: 10.5 }}>
                {r.expires_at || "—"}</td>
              <td style={td}><DaysBar days={r.days_left} /></td>
              <td style={{ ...td, fontSize: 10.5 }}>{r.used_by}
                {r.group_key && <span style={{ color: t.sub }}>
                  {" · "}{r.group_key}</span>}</td>
              <td style={{ ...td, fontSize: 10.5 }}>{r.owner || "—"}
                {r.ticket_url && <a href={r.ticket_url}
                  style={{ marginLeft: 6, fontSize: 10 }}>ticket ↗</a>}</td>
            </tr>))}
        </tbody>
      </table>
      <div style={{ padding: "8px 13px", fontSize: 10.5, color: t.sub }}>
        rows sharing a group key share one physical cert — one renewal
        fixes all of them · scanner reads the live chain (CN, issuer,
        expiry), not a spreadsheet</div>
    </Panel>);
}

/* ---------------- health ---------------- */

function Health({ t, health }) {
  if (!health || health.error) return <Load err={health && health.error} />;
  const groups = {};
  (health.checks || []).forEach((c) => {
    (groups[c.env_group] = groups[c.env_group] || []).push(c);
  });
  const th = { textAlign: "left", fontSize: 9.5, textTransform: "uppercase",
    color: t.sub, padding: "7px 13px",
    borderBottom: `1.5px solid ${t.panel2}`, background: "#fafcfc" };
  const td = { padding: "7px 13px", borderBottom: "1px solid #eef1f4" };
  return (
    <div>
      {Object.keys(groups).map((g) => {
        const list = groups[g];
        const deg = list.filter((c) => c.status && c.status !== "OK").length;
        return (
          <Panel key={g} t={t} title={g}
            right={deg ? <Chip tone="amber">{deg} degraded</Chip>
              : <Chip tone="green">all healthy</Chip>}>
            <table style={{ borderCollapse: "collapse", width: "100%",
              fontSize: 11.5 }}>
              <thead><tr><th style={th}>check</th>
                <th style={th}>what it verifies</th><th style={th}>now</th>
                <th style={th}>latency</th>
                <th style={th}>last 30 days</th></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.check_id} style={{ background:
                    c.status === "WARN" ? "#fffaf4"
                    : c.status === "FAIL" ? "#fff5f7" : "transparent" }}>
                    <td style={{ ...td, ...mono, fontSize: 10.5 }}>{c.name}</td>
                    <td style={{ ...td, fontSize: 11 }}>{c.verifies}</td>
                    <td style={td}>{c.status
                      ? <Chip tone={c.status === "OK" ? "green"
                          : c.status === "WARN" ? "amber" : "red"}>
                          {c.status === "OK" ? (c.detail || "OK")
                            : (c.detail || c.status)}</Chip>
                      : <Chip tone="grey">never run</Chip>}</td>
                    <td style={{ ...td, ...mono, fontSize: 10.5 }}>
                      {c.latency_ms != null ? `${c.latency_ms}ms` : "—"}</td>
                    <td style={td}><Strip cells={c.strip} /></td>
                  </tr>))}
              </tbody>
            </table>
          </Panel>);
      })}
    </div>);
}

/* ---------------- topology ---------------- */

const ZONES = [["User zone", 0, 15], ["OpenShift · OCPQ", 15, 37],
  ["Data zone", 52, 22], ["DMZ · egress", 74, 12], ["Vendors", 86, 14]];

function Topology({ t, topo }) {
  if (!topo || topo.error) return <Load err={topo && topo.error} />;
  const nodes = topo.nodes || [];
  const links = topo.links || [];
  const byId = {};
  nodes.forEach((n) => { byId[n.node_id] = n; });
  const NW = 158, NH = 46;
  return (
    <div>
      <div style={{ position: "relative", height: 560, background: "#fff",
        border: `1px solid ${t.border}`, borderRadius: 6,
        overflow: "hidden" }}>
        <style>{"@keyframes envdash{to{stroke-dashoffset:-13}}" +
          "@keyframes envpulse{0%,100%{opacity:1}50%{opacity:.35}}"}</style>
        {ZONES.map(([z, l, w]) => (
          <div key={z} style={{ position: "absolute", top: 0, bottom: 0,
            left: `${l}%`, width: `${w}%`,
            borderRight: "1.5px dashed #d3dce2" }}>
            <span style={{ position: "absolute", top: 8, left: 12,
              fontSize: 9.5, fontWeight: 800, textTransform: "uppercase",
              letterSpacing: ".08em", color: "#8a97a3" }}>{z}</span>
          </div>))}
        <svg style={{ position: "absolute", inset: 0, width: "100%",
          height: "100%", zIndex: 1 }}>
          {links.map((l) => {
            const a = byId[l.from_node], b = byId[l.to_node];
            if (!a || !b) return null;
            const x1 = (a.x || 0) + NW, y1 = (a.y || 0) + NH / 2;
            const x2 = b.x || 0, y2 = (b.y || 0) + NH / 2;
            const mid = (x1 + x2) / 2;
            const col = l.link_status === "WARN" ? C.warn
              : l.link_status === "FAIL" ? C.bad : C.ok;
            return (
              <g key={l.link_id}>
                <path d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  stroke={col} strokeWidth="2.2" fill="none"
                  strokeDasharray="7 6"
                  style={{ animation: "envdash 1.2s linear infinite" }} />
                {l.cert_days != null && (
                  <text x={mid} y={(y1 + y2) / 2 - 8} textAnchor="middle"
                    style={{ fontSize: 9, fontWeight: 800,
                      fill: l.cert_days <= 7 ? C.bad
                        : l.cert_days <= 30 ? C.warn : C.ok }}>
                    TLS · {l.cert_days}d</text>)}
              </g>);
          })}
        </svg>
        {nodes.map((n) => {
          const [, , fg] = stTone(n.status);
          return (
            <div key={n.node_id} style={{ position: "absolute",
              left: n.x || 0, top: n.y || 0, width: NW, background: "#fff",
              border: `1.5px solid ${t.panel2}`, borderRadius: 8,
              padding: "8px 11px", fontSize: 10.5, zIndex: 3,
              boxShadow: "0 3px 8px rgba(20,40,60,.10)" }}>
              <span style={{ position: "absolute", top: -5, right: -5,
                width: 11, height: 11, borderRadius: "50%",
                border: "2px solid #fff", background: fg,
                animation: n.status === "FAIL"
                  ? "envpulse 1.2s infinite" : "none" }} />
              <b style={{ display: "flex", gap: 6, alignItems: "center",
                fontSize: 11, color: t.navy }}>{n.icon} {n.label}</b>
              <small style={{ display: "block", ...mono, fontSize: 8.5,
                color: t.sub, marginTop: 2 }}>{n.sub}</small>
            </div>);
        })}
        {!nodes.length && (
          <div style={{ padding: 30, fontSize: 12, color: t.sub,
            textAlign: "center" }}>No topology nodes yet — seed
            env_nodes / env_links (INSERTs, no code).</div>)}
      </div>
      <div style={{ fontSize: 10.5, color: t.sub, marginTop: 8 }}>
        badges = TLS certs on that hop · dots = node health ·
        link color = path health · all live from the same probe results
      </div>
    </div>);
}

/* ---------------- pulse ---------------- */

const KINDCHIP = { DNS: "blue", TLS: "blue", HTTP: "blue", SQL: "blue",
  FS: "blue" };

function Pulse({ t, pulse, running, onRun }) {
  if (!pulse || pulse.error) return <Load err={pulse && pulse.error} />;
  const run = (pulse.runs || [])[0];
  const rows = pulse.latest_rows || [];
  return (
    <div>
      <div style={{ display: "flex", gap: 14, alignItems: "center",
        marginBottom: 13 }}>
        <style>{"@keyframes envring{0%{transform:scale(.85);opacity:1}" +
          "100%{transform:scale(1.45);opacity:0}}"}</style>
        <div onClick={running ? undefined : onRun}
          style={{ position: "relative", width: 74, height: 74,
            borderRadius: "50%", background: t.accent, color: "#fff",
            display: "grid", placeItems: "center", fontSize: 11,
            fontWeight: 700, cursor: running ? "wait" : "pointer",
            flexShrink: 0, opacity: running ? 0.7 : 1 }}>
          {running ? "…" : "▶ PULSE"}
          <span style={{ position: "absolute", inset: -6,
            borderRadius: "50%", border: `2.5px solid ${t.pop}`,
            animation: "envring 1.8s ease-out infinite" }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {run ? `Last pulse: ${run.started_at} · ${run.total_n}
              probes · ${run.ok_n} ✓ · ${run.warn_n}
              ⚠ · ${run.fail_n} ✗`
              : "No pulse run yet — press the button"}</div>
          <div style={{ fontSize: 11, color: t.sub }}>
            probes stream in dependency order — one root cause reads as
            one red line, not seventeen alarms · results kept 90 days
          </div>
        </div>
        {run && (run.warn_n > 0 || run.fail_n > 0) && (
          <span style={{ marginLeft: "auto" }}>
            <Chip tone={run.fail_n > 0 ? "red" : "amber"}>
              {"⚠"} {run.warn_n + run.fail_n} findings</Chip></span>)}
      </div>
      <Panel t={t} title={run ? `Pulse · ${run.started_at}` : "Pulse"}
        right={<span style={{ fontSize: 10.5, color: t.sub }}>
          network → platform → data → integration</span>}>
        {rows.map((r) => (
          <div key={r.check_id + r.checked_at} style={{ display: "flex",
            gap: 10, alignItems: "center", padding: "6px 13px",
            borderBottom: "1px solid #eef1f4", fontSize: 11.5 }}>
            <span style={{ ...mono, fontSize: 10, color: t.sub,
              width: 64 }}>{r.checked_at}</span>
            <Chip tone={KINDCHIP[r.kind] || "grey"}>{r.kind}</Chip>
            <span style={{ ...mono, fontSize: 10.5, flex: 1 }}>{r.name}</span>
            <Chip tone={r.status === "OK" ? "green"
              : r.status === "WARN" ? "amber" : "red"}>
              {r.status === "OK" ? (r.detail || "OK") : r.detail}</Chip>
            <span style={{ ...mono, fontSize: 10, color: t.sub, width: 64,
              textAlign: "right" }}>
              {r.latency_ms != null ? `${r.latency_ms}ms` : "—"}</span>
          </div>))}
        {!rows.length && <div style={{ padding: "12px 13px", fontSize: 11.5,
          color: t.sub }}>No results yet.</div>}
      </Panel>
    </div>);
}

const Load = ({ err }) => (
  <div style={{ padding: 30, fontSize: 12, color: "#7b8894",
    textAlign: "center" }}>
    {err ? `Live query failed — ${err}` : "Loading…"}</div>);

function Inventory({ t, inv }) {
  if (!inv) return <div style={{ padding: 20, fontSize: 12, color: t.muted }}>
    Loading inventory…</div>;
  const rows = inv.inventory || [];
  const live = {};
  (inv.liveness || []).forEach((l) => { live[String(l.target).toLowerCase()] = l; });
  const plats = [];
  rows.forEach((r) => {
    let p = plats.find((x) => x.name === r.platform);
    if (!p) { p = { name: r.platform, rows: [] }; plats.push(p); }
    p.rows.push(r);
  });
  const proof = (hosts) => {
    if (!hosts) return null;
    const found = String(hosts).toLowerCase().split(/[\s/]+/)
      .map((h) => live[h]).filter(Boolean);
    if (!found.length) return null;
    const bad = found.find((l) => l.status !== "OK");
    return bad
      ? <span title={bad.detail} style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px",
          borderRadius: 999, background: "#fde8e8", color: "#c0392b" }}>
          ✗ {bad.target.split(".")[0]} not resolving</span>
      : <span title={found.map((l) => l.detail).join(" · ")}
          style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px",
          borderRadius: 999, background: "#d0ebd9", color: "#159943" }}>
          ✓ DNS proven · {found.length} host{found.length > 1 ? "s" : ""}</span>;
  };
  const chip = (st) => st === "Completed"
    ? { background: "#d0ebd9", color: "#159943" }
    : st === "In Progress" ? { background: "#fae5d3", color: "#a8560f" }
    : { background: "#f0f0f2", color: "#888" };
  return (
    <div>
      <div style={{ fontSize: 11, color: t.sub, margin: "2px 0 14px" }}>
        SWP environment build-out — from the provisioning tracker (RITMs), joined to
        live DNS pulse results: the tracker <b>claims</b>, the pulse <b>proves</b>.
        Re-ingest: re-run sql/40 with updated rows.</div>
      {plats.map((p) => (
        <div key={p.name} style={{ background: "#fff", border: `1px solid ${t.panel2}`,
          borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
            background: "linear-gradient(to right,#eef3f8,#f7fafc)", fontSize: 13.5,
            fontWeight: 700, color: t.navy }}>
            {p.name}
            <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 9px",
              borderRadius: 999, ...chip(p.rows.find((r) => r.status === "In Progress")
                ? "In Progress" : "Completed") }}>
              {p.rows.find((r) => r.status === "In Progress") ? "IN PROGRESS" : "COMPLETED"}</span>
            <span style={{ marginLeft: "auto", fontSize: 10, color: t.muted, fontWeight: 400 }}>
              {p.rows[0].os} · {p.rows[0].priority}
              {p.rows[0].ritm ? ` · ${p.rows[0].ritm}` : ""}</span>
          </div>
          <div style={{ display: "grid",
            gridTemplateColumns: "64px minmax(0,1fr) minmax(0,1.2fr) minmax(0,.9fr) 120px",
            gap: 10, padding: "6px 16px", fontSize: 8.5, fontWeight: 700,
            textTransform: "uppercase", color: t.muted, background: "#f7f9fa" }}>
            <span>Region</span><span>Existing</span><span>New SEI environment</span>
            <span>Sizing</span><span>Status · proof</span></div>
          {p.rows.map((r) => (
            <div key={r.inv_id} style={{ display: "grid",
              gridTemplateColumns: "64px minmax(0,1fr) minmax(0,1.2fr) minmax(0,.9fr) 120px",
              gap: 10, padding: "9px 16px", fontSize: 11, borderTop: "1px solid #eef1f4",
              alignItems: "start" }}>
              <b style={{ color: t.navy }}>{r.region}</b>
              <span style={{ fontFamily: "Roboto Mono, monospace", fontSize: 9.5,
                color: t.sub, wordBreak: "break-word" }}>{r.existing_host || "—"}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ fontFamily: "Roboto Mono, monospace", fontSize: 9.5,
                  color: r.new_host ? t.navy : t.muted, wordBreak: "break-word" }}>
                  {r.new_host || "not required"}</span>
                {r.db_name && r.db_name !== "n/a" && (
                  <span style={{ fontSize: 9, color: "#6d3ac0", marginLeft: 6 }}>
                    {r.db_name}</span>)}
                {r.note && <div title={r.note} style={{ fontSize: 9, color: t.muted,
                  marginTop: 2, overflow: "hidden", textOverflow: "ellipsis",
                  whiteSpace: "nowrap" }}>{r.note}</div>}
              </span>
              <span style={{ fontSize: 9.5, color: t.sub }}>{r.sizing || "—"}
                {r.target_delivery && <div style={{ color: t.muted }}>
                  target {r.target_delivery}</div>}</span>
              <span>
                <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px",
                  borderRadius: 999, ...chip(r.status) }}>{r.status || "—"}</span>
                <div style={{ marginTop: 4 }}>{proof(r.new_host)}</div>
              </span>
            </div>))}
        </div>))}
    </div>);
}

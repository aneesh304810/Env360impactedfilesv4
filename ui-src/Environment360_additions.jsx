// =====================================================================
// Environment 360 — ADDITIONS (drop into your existing Environment360.jsx)
// Everything reads env_infra/env_probe from the DB via api.js. NO embedded
// sheet, NO hardcoded hosts — the workbook is only an import/export format.
//
// INTEGRATION (6 lines in your file):
//   import { InventoryTab, SslSummaryCards, NetworkBoard } from "./Environment360_additions";
//   const tabs = [ ...yours..., ["inventory", "Inventory"] ];
//   {tab === "inventory" && <InventoryTab t={t} onChanged={refresh} />}
//   // in Overview, after your kpi grid:        <SslSummaryCards t={t} onDrill={() => setTab("certs")} />
//   // in Overview, after your env_group grid:  <NetworkBoard t={t} />
// api.js: merge env360_api_additions.js (envInfra, envInfraSaveRow, ...).
// =====================================================================
import React, { useState, useEffect } from "react";
import { api } from "./api.js";

const C = { ok: "#159943", okbg: "#d0ebd9", warn: "#e67e22", warnbg: "#fae5d3",
 bad: "#c1113a", badbg: "#f3d2d7", grey: "#dfe6e9", sub: "#666",
 navy: "#10193b", tbd: "#c98d1a" };
const mono = { fontFamily: "Roboto Mono, Consolas, monospace" };
const isTbd = (p) => !p || p.toUpperCase().includes("TBD");
const sslDays = (d) => d ? Math.round((new Date(d) - Date.now()) / 864e5) : null;

function Chip({ tone, children }) {
 const m = { green: [C.okbg, C.ok], amber: [C.warnbg, C.warn],
  red: [C.badbg, C.bad], grey: [C.grey, C.sub],
  tbd: ["#fff", C.tbd] };
 const [bg, fg] = m[tone] || m.grey;
 return <span style={{ fontSize: 9.5, fontWeight: 700, padding: "2px 8px",
  borderRadius: 999, whiteSpace: "nowrap", background: bg, color: fg,
  border: tone === "tbd" ? `1.5px dashed ${C.tbd}` : "none" }}>{children}</span>;
}

/* ============================ INVENTORY ============================ */
// Reads GET /env-infra (DB). Save = PUT /env-infra/row · Delete = DELETE
// /env-infra/row — both write env_infra + hist and regenerate probes.
// Upload/Download use /env-infra/import + /export (workbook as a FORMAT).

const FIELDS = [["hosts", "hosts", 220], ["sizing_ram", "ram", 52],
 ["sizing_cpu", "cpu", 36], ["sizing_storage", "storage", 80],
 ["protocol_port", "port", 110], ["ssl_expiry", "ssl expiry", 86],
 ["notes", "notes", 150]];

export function InventoryTab({ t, onChanged }) {
 const [data, setData] = useState(null);
 const [env, setEnv] = useState("DEV");
 const [edit, setEdit] = useState(null);          // key env|layer|system
 const [draft, setDraft] = useState({});
 const [msg, setMsg] = useState(null);
 const load = () => api.envInfra().then(setData);
 useEffect(() => { load(); }, []);
 if (!data || data.error) return <div style={{ padding: 30, fontSize: 12,
  color: "#7b8894", textAlign: "center" }}>
  {data && data.error ? `Live query failed — ${data.error}` : "Loading…"}</div>;
 const envs = Object.keys(data.environments || {});
 const rows = (data.environments || {})[env] || [];
 const key = (r) => r.env + "|" + r.layer + "|" + r.system_name;
 const done = (d) => { setMsg({ ok: 1, text:
   `saved · probes ${d.probes_armed} ARMED / ${d.probes_waiting} WAITING` });
  setEdit(null); load(); onChanged && onChanged(); };
 const save = (r) => api.envInfraSaveRow({ ...r, ...draft }).then(done)
  .catch((e) => setMsg({ ok: 0, text: String(e) }));
 const del = (r) => api.envInfraDeleteRow(r).then(done)
  .catch((e) => setMsg({ ok: 0, text: String(e) }));
 const add = () => api.envInfraSaveRow({ env, layer: "Consumer",
  system_name: "New System " + Date.now() % 1000, hosts: "host.bbh.com",
  protocol_port: "TBD", notes: "added via inventory" }).then(done);
 const th = { textAlign: "left", fontSize: 9.5, textTransform: "uppercase",
  letterSpacing: ".04em", color: t.sub, padding: "7px 13px",
  borderBottom: `1.5px solid ${t.panel2}`, background: "#fafcfc" };
 const td = { padding: "6px 13px", borderBottom: "1px solid #eef1f4" };
 const inp = (r, f, w) => (
  <input defaultValue={r[f] || ""} style={{ width: w, fontSize: 10.5, ...mono,
   border: `1px solid ${t.border}`, borderRadius: 3, padding: "2px 5px" }}
   onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))} />);
 return (
  <div style={{ background: "#fff", border: `1px solid ${t.border}`,
   borderRadius: 3, boxShadow: "0 3px 5px rgba(0,0,0,.08)", overflow: "hidden" }}>
   <div style={{ display: "flex", alignItems: "center", gap: 8,
    padding: "8px 13px", borderBottom: `1px solid ${t.panel2}`,
    background: "#fafcfc" }}>
    <h2 style={{ fontSize: 11.5, textTransform: "uppercase", margin: 0 }}>
     Server inventory</h2>
    {data.mode === "DEMO" && <Chip tone="amber">○ DEMO — API unreachable, sample data</Chip>}
    {envs.map((e) => (
     <span key={e} onClick={() => { setEnv(e); setEdit(null); }}
      style={{ fontSize: 10.5, fontWeight: 700, cursor: "pointer",
       padding: "3px 11px", borderRadius: 999,
       background: e === env ? t.accent : "#fff",
       color: e === env ? "#fff" : t.sub,
       border: `1px solid ${e === env ? t.accent : t.border}` }}>{e}</span>))}
    <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
     <button onClick={add} style={btn(t)}>＋ Add row</button>
     <button onClick={() => { window.location.href = api.envInfraExportUrl(); }}
      style={btn(t)}>⬇ Download workbook</button>
     <label style={{ ...btn(t), display: "inline-block" }}>⬆ Upload
      <input type="file" accept=".tsv,.csv,.txt,.xlsx" style={{ display: "none" }}
       onChange={(e) => { const f = e.target.files[0]; if (!f) return;
        api.envInfraImport(f).then((d) => { setMsg({ ok: 1, text:
         `import: +${d.added} ~${d.changed} −${d.removed} · probes ` +
         `${d.probes_armed} ARMED / ${d.probes_waiting} WAITING` });
         load(); onChanged && onChanged(); })
        .catch((er) => setMsg({ ok: 0, text: "import rejected — " + er }));
        e.target.value = ""; }} /></label>
    </span>
   </div>
   {msg && <div style={{ padding: "6px 13px", fontSize: 10.5, fontWeight: 700,
    background: msg.ok ? "#e0f5fd" : C.badbg,
    color: msg.ok ? "#0b6a8a" : C.bad }}>{msg.text}
    <span style={{ float: "right", cursor: "pointer" }}
     onClick={() => setMsg(null)}>✕</span></div>}
   <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 11 }}>
    <thead><tr><th style={th}>layer</th><th style={th}>system</th>
     {FIELDS.map(([f, l]) => <th key={f} style={th}>{l}</th>)}
     <th style={th}>actions</th></tr></thead>
    <tbody>
    {rows.map((r) => {
     const ed = edit === key(r);
     const n = sslDays(r.ssl_expiry);
     return (
      <tr key={key(r)} style={{ background: ed ? "#e0f5fd" : "transparent" }}>
       <td style={td}>{r.layer}</td>
       <td style={{ ...td, fontWeight: 700 }}>{r.system_name}</td>
       {FIELDS.map(([f, , w]) => (
        <td key={f} style={{ ...td, ...mono, fontSize: 10 }}>
         {ed ? inp(r, f, w)
          : f === "protocol_port"
           ? (isTbd(r[f]) ? <Chip tone="tbd">◌ TBD</Chip>
              : <Chip tone="green">{r[f]}</Chip>)
          : f === "ssl_expiry" && r[f]
           ? <Chip tone={n <= 7 ? "red" : n <= 30 ? "amber" : "green"}>
              {r[f]} · {n}d</Chip>
           : (r[f] || "—")}</td>))}
       <td style={{ ...td, whiteSpace: "nowrap" }}>
        {ed ? <>
          <button style={btn(t)} onClick={() => save(r)}>Save</button>{" "}
          <button style={btn(t)} onClick={() => setEdit(null)}>✕</button></>
         : <>
          <span style={{ cursor: "pointer" }} title="edit"
           onClick={() => { setDraft({}); setEdit(key(r)); }}>✎</span>{" "}
          <span style={{ cursor: "pointer" }} title="delete"
           onClick={() => del(r)}>🗑</span></>}
       </td>
      </tr>);
    })}
    </tbody>
   </table>
   <div style={{ padding: "7px 13px", fontSize: 10.5, color: t.sub }}>
    save/delete write env_infra + env_infra_hist and regenerate env_probe ·
    port filled → probe ARMED next pulse · workbook is import/export only,
    never the source of truth</div>
  </div>);
}
const btn = (t) => ({ height: 24, background: "#fff", color: t.accent,
 border: `1px solid ${t.border}`, borderRadius: 2, fontSize: 10.5,
 padding: "0 9px", cursor: "pointer" });

/* ========================= SSL SUMMARY CARD ========================= */
// One card, worst-first, click drills to your Certificates tab.
// Source: rows already in env_infra (ssl_expiry) via api.envInfra().

export function SslSummaryCards({ t, onDrill, env = null }) {
 const [rows, setRows] = useState(null);
 useEffect(() => { api.envInfra().then((d) => {
  if (d && !d.error) setRows(Object.values(d.environments || {}).flat()); }); }, []);
 if (!rows) return null;
 const certs = rows.filter((r) => r.ssl_expiry && (!env || r.env === env))
  .map((r) => ({ ...r, d: sslDays(r.ssl_expiry) }))
  .sort((a, b) => a.d - b.d);
 if (!certs.length) return null;
 const w = certs[0];
 const col = w.d <= 7 ? C.bad : w.d <= 30 ? C.warn : C.ok;
 const nc = certs.filter((c) => c.d <= 7).length;
 const nw = certs.filter((c) => c.d > 7 && c.d <= 30).length;
 return (
  <div onClick={onDrill} title="open Certificates"
   style={{ background: w.d <= 7 ? "#fff5f7" : w.d <= 30 ? "#fffaf4" : "#fff",
    border: `1px solid ${t.border}`, borderTop: `3px solid ${col}`,
    borderRadius: 3, padding: "10px 13px", textAlign: "center",
    cursor: "pointer" }}>
   <b style={{ display: "block", fontSize: 23, color: col }}>{w.d}d</b>
   <span style={{ fontSize: 10, textTransform: "uppercase",
    letterSpacing: ".05em", color: t.sub }}>
    🔒 ssl · {certs.length} cert{certs.length > 1 ? "s" : ""}</span>
   <div style={{ ...mono, fontSize: 9, color: t.sub, marginTop: 2 }}>
    next: {w.system_name}
    {nc ? ` · ${nc} critical` : ""}{nw ? ` · ${nw} warning` : ""} →</div>
  </div>);
}

/* ========================= NETWORK BOARD ========================= */
// The NOC-style enterprise board — zones, firewalls, rule chips — driven by
// GET /env-infra/topology?env= (nodes/lanes/tbd from DB rows, AUTO components
// included) + GET /env-infra/probes/live (real statuses). Layout is
// presentation-only and lives here; data never does.

const NB = { W: 190, H: 52 };
const NBV_ZONES = [["EXTERNAL · SEI / VENDOR", 24], ["DMZ · MFT / EGRESS", 258],
 ["CORP · USERS / IDENTITY", 503], ["OPENSHIFT · OCPQ", 738],
 ["DATA ZONE", 1008], ["CONSUMERS", 1238]];
const NBV_POS = {                      // node id -> [x,y] (v2 vertical, airy)
 "ext.sei": [36, 90], "ext.saas": [36, 170], "ext.seiapi": [36, 470],
 "egr.allowlist": [36, 470],
 "dmz.mft": [270, 90], "dmz.momentum": [270, 170], "dmz.cifs": [270, 250],
 "dmz.apigee": [270, 470],
 "corp.users": [515, 90], "corp.ping": [515, 170], "mgmt.stack": [515, 470],
 "app.ingress": [750, 90], "app.hub": [750, 170],
 "data.imds": [1020, 90], "data.pbdw": [1020, 210],
 "cons.piv": [1250, 90], "cons.portal": [1250, 190], "cons.vendor": [1250, 270] };
const NBV_AUTO = { "DATA ZONE": [1020, 330], "CONSUMERS": [1250, 350],
 "DMZ · MFT / EGRESS": [270, 330], "EXTERNAL": [36, 250],
 "CP INTEGRATION HUB · OPENSHIFT": [750, 330] };
const NBV_STATIC = [
 { id: "ext.sei", title: "☁ SEI SWP", sub: "batch + api endpoints" },
 { id: "ext.saas", title: "☁ SEI SaaS · SWP Desktop", sub: "user UI · SSO BBH ↔ SEI" },
 { id: "dmz.momentum", title: "⚙ Momentum MFT", sub: "drop → landing · atomic" },
 { id: "corp.users", title: "👤 Users · analysts", sub: "10.30.0.0/16", bare: true },
 { id: "corp.ping", title: "🔐 PingFederate", sub: "user SSO → SWP desktop",
   hosts: "ping-idp-01; ping-idp-02" },
 { id: "mgmt.stack", title: "📊 Splunk · Vault · OIDC", sub: "observability" },
 { id: "app.ingress", title: "🌐 OCP ingress", sub: "ops/admin only" }];
const NBV_CTX = [
 { id: "usr-ping", from: "corp.users", to: "corp.ping", rule: "SSO" },
 { id: "ping-saas", from: "corp.ping", to: "ext.saas", rule: "fed 443" },
 { id: "usr-saas", from: "corp.users", to: "ext.saas", rule: "SSO 443" },
 { id: "mom-cifs", from: "dmz.momentum", to: "dmz.cifs", rule: "moves" },
 { id: "hub-mgm", from: "app.hub", to: "mgmt.stack", rule: "8088" }];
const NBV_DOT = { OK: "#2fb344", WARN: "#e8a013", DOWN: "#d43a3a", WAIT: "#9aa7b2" };
const NBV_W = 190;
const NBV_COLS = [36, 270, 515, 750, 1020, 1250];
const nbvCorR = (x) => { for (let i = 0; i < NBV_COLS.length; i++)
 if (Math.abs(NBV_COLS[i] - x) < 5) return i < NBV_COLS.length - 1
  ? (NBV_COLS[i] + NBV_W + NBV_COLS[i + 1]) / 2 : NBV_COLS[i] + NBV_W + 22;
 return x + NBV_W + 22; };
const nbvCorL = (x) => { for (let i = 0; i < NBV_COLS.length; i++)
 if (Math.abs(NBV_COLS[i] - x) < 5) return i > 0
  ? (NBV_COLS[i - 1] + NBV_W + NBV_COLS[i]) / 2 : NBV_COLS[i] - 18;
 return x - 18; };
const nbvSegHits = (p, q, rects) => {
 const dx = q[0] - p[0], dy = q[1] - p[1];
 const n = Math.max(2, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 7));
 for (let i = 1; i < n; i++) { const x = p[0] + dx * i / n, y = p[1] + dy * i / n;
  for (const R of rects)
   if (x > R.x + 1 && x < R.x + R.w - 1 && y > R.y + 1 && y < R.y + R.h - 1) return true; }
 return false; };
const nbvRoute = (a, b, ah, bh, rects, lane) => {
 // corridors + clear-rail search: no segment may enter any card interior
 const off = (lane || 0) * 12, goR = b.x >= a.x;
 let p1 = goR ? [a.x + NBV_W, a.y + ah / 2] : [a.x, a.y + ah / 2];
 let p2 = goR ? [b.x, b.y + bh / 2] : [b.x + NBV_W, b.y + bh / 2];
 let c1 = (goR ? nbvCorR(a.x) : nbvCorL(a.x)) + off;
 let c2 = (goR ? nbvCorL(b.x) : nbvCorR(b.x)) + off;
 if (Math.abs(a.x - b.x) < 5) { c1 = nbvCorR(a.x) + off; c2 = c1;
  p1 = [a.x + NBV_W, a.y + ah / 2]; p2 = [b.x + NBV_W, b.y + bh / 2]; }
 const cands = [(p1[1] + p2[1]) / 2, p2[1], p1[1]];
 for (let y = 56; y <= 596; y += 12) cands.push(y);
 for (let ci = 0; ci < cands.length; ci++) {
  const ry = cands[ci] + (ci < 3 ? off : 0);
  const raw = Math.abs(c1 - c2) < 3
   ? [p1, [c1, p1[1]], [c1, p2[1]], p2]
   : [p1, [c1, p1[1]], [c1, ry], [c2, ry], [c2, p2[1]], p2];
  const pts = [raw[0]];
  for (let i = 1; i < raw.length; i++) { const pr = pts[pts.length - 1];
   if (Math.abs(pr[0] - raw[i][0]) > 0.5 || Math.abs(pr[1] - raw[i][1]) > 0.5)
    pts.push(raw[i]); }
  let hit = false;
  for (let i = 0; i < pts.length - 1 && !hit; i++)
   hit = nbvSegHits(pts[i], pts[i + 1], rects);
  if (!hit) { const m1 = pts[Math.floor(pts.length / 2) - 1],
   m2 = pts[Math.floor(pts.length / 2)];
   return { pts, badge: [(m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2] }; }
 }
 return { pts: [p1, p2], badge: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2] };
};
const nbvPathD = (pts) => {
 let d = "M " + pts[0].join(" ");
 for (let i = 1; i < pts.length - 1; i++) {
  const p = pts[i - 1], c = pts[i], n = pts[i + 1], r = 9;
  const v1 = [Math.sign(c[0] - p[0]), Math.sign(c[1] - p[1])];
  const v2 = [Math.sign(n[0] - c[0]), Math.sign(n[1] - c[1])];
  const l1 = Math.min(r, Math.hypot(c[0] - p[0], c[1] - p[1]) / 2);
  const l2 = Math.min(r, Math.hypot(n[0] - c[0], n[1] - c[1]) / 2);
  d += ` L ${c[0] - v1[0] * l1} ${c[1] - v1[1] * l1} Q ${c[0]} ${c[1]} ${c[0] + v2[0] * l2} ${c[1] + v2[1] * l2}`;
 }
 return d + " L " + pts[pts.length - 1].join(" ");
};

export function RulesTbdCard({ t }) {
 const [n, setN] = useState(null);
 useEffect(() => { api.envInfraRules("DEV").then((r) =>
  setN((r || []).filter((x) => x.state === "TBD").length)); }, []);
 return (
  <div style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 6,
   borderTop: `3px solid ${n ? "#c98d1a" : "#159943"}`, padding: 10,
   textAlign: "center", boxShadow: "0 2px 4px rgba(0,0,0,.05)" }}>
   <b style={{ fontSize: 23, color: n ? "#a97812" : t.navy }}>{n == null ? "…" : n}</b>
   <div style={{ fontSize: 9.5, color: t.sub, textTransform: "uppercase" }}>◌ rules TBD</div>
   <div style={{ fontSize: 8.5, color: "#9aa7b2" }}>firewall asks open</div>
  </div>);
}

export function NetworkBoard({ t, env = "DEV" }) {
 const [envSel, setEnvSel] = useState(env);
 const [topo, setTopo] = useState(null);
 const [live, setLive] = useState({});
 const [open, setOpen] = useState({});
 const [sel, setSel] = useState(null);
 useEffect(() => { api.envInfraTopology(envSel).then(setTopo); }, [envSel]);
 useEffect(() => {
  const beat = () => api.envProbesLive(envSel).then((l) => {
   if (!l || l.error) return;
   const m = {};
   (l || []).forEach((r) => {
    const id = r.probe_id.split(".").slice(1).join(".");
    m[id] = { st: r.state === "WAITING" || r.status === "SKIP" ? "WAIT"
      : (r.status || "OK"), detail: r.detail || "" };
   });
   setLive(m);
  });
  beat(); const h = setInterval(beat, 5000); return () => clearInterval(h);
 }, [envSel]);
 if (!topo || topo.error) return <div style={{ padding: 30, fontSize: 12,
  color: "#7b8894", textAlign: "center" }}>
  {topo && topo.error ? `Live query failed — ${topo.error}` : "Loading network board…"}</div>;
 const autoCount = {}; const seen = new Set(); const nodes = [];
 (topo.nodes || []).forEach((n) => {
  let p = NBV_POS[n.id];
  if (!p) {
   const base = NBV_AUTO[n.zone] || [750, 560];
   const k = autoCount[n.zone] = (autoCount[n.zone] || 0) + 1;
   p = [base[0], base[1] + (k - 1) * 66];
  }
  seen.add(n.id); nodes.push({ ...n, x: p[0], y: p[1] });
 });
 NBV_STATIC.forEach((sn) => { if (seen.has(sn.id)) return;
  const p = NBV_POS[sn.id]; nodes.push({ ...sn, x: p[0], y: p[1], ctx: true }); });
 const byId = {}; nodes.forEach((n) => { byId[n.id] = n; });
 const members = (n) => {
  const lv = live[n.id] || {};
  if (n.id === "app.hub") {
   const base = ["airflow-scheduler", "airflow-worker", "airflow-dag-proc",
    "postgres", "outbound producers"];
   const bad = /pods not ready: ([^;]*)/.exec(lv.detail || "");
   return base.map((nm) => [nm,
    bad && bad[1].includes(nm.replace("airflow-", "")) ? "DOWN"
     : (lv.st === "WAIT" ? "WAIT" : "OK")]);
  }
  const src = n.sub || n.hosts || "";
  const hs = src.split(";").map((x) => x.trim()).filter((x) => x && !x.startsWith("ns:"));
  if (hs.length < 2) return [];
  return hs.slice(0, 4).map((h2) => {
   const mk = live[n.id + "." + h2.split(".")[0]];
   return [h2.slice(0, 26), (mk || lv).st || "WAIT"];
  });
 };
 const cardH = (n) => { const m = members(n);
  return m.length ? (open[n.id] ? 46 + m.length * 20 : 44) : 44; };
 const worstOf = (n) => {
  const lv = (live[n.id] || {}).st || (n.ctx ? "" : "WAIT");
  let w = lv;
  members(n).forEach(([, st2]) => { if (st2 === "DOWN") w = "DOWN"; });
  return w;
 };
 const lanes = [...(topo.lanes || []), ...NBV_CTX];
 return (
  <div style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 6,
   boxShadow: "0 2px 4px rgba(0,0,0,.05)" }}>
   <div style={{ display: "flex", gap: 8, alignItems: "center",
    padding: "9px 13px", borderBottom: `1px solid ${t.panel2}` }}>
    <b style={{ fontSize: 11, textTransform: "uppercase", color: "#0f4775" }}>
     Network topology · cluster view</b>
    {["DEV", "SIT", "TRIAL_UAT", "PROD"].map((e) => (
     <span key={e} onClick={() => setEnvSel(e)} style={{ fontSize: 10.5,
      fontWeight: 700, padding: "3px 12px", borderRadius: 999, cursor: "pointer",
      border: `1px solid ${envSel === e ? t.navy : t.border}`,
      background: envSel === e ? t.navy : "#fff",
      color: envSel === e ? "#fff" : t.sub }}>{e.replace("_", "/")}</span>))}
    <span style={{ marginLeft: "auto", fontSize: 9.5, color: t.sub }}>
     click cluster cards to expand members · badges: i rule / ? TBD · dots = health</span>
   </div>
   <div style={{ overflow: "auto" }}>
    <svg viewBox="0 0 1460 640" style={{ minWidth: 1200, display: "block" }}>
     {NBV_ZONES.map((z) => (
      <g key={z[0]}>
       <line x1={z[1] - 12} y1={46} x2={z[1] - 12} y2={600} stroke="#eef2f5"
        strokeWidth={1.4} />
       <text x={z[1]} y={40} fontSize={8.6} fontWeight={800} fill="#a7b7c5"
        letterSpacing={2}>{z[0]}</text></g>))}
     {(() => {
      const rects = nodes.map((n) => ({ x: n.x, y: n.y, w: NBV_W, h: cardH(n) }));
      const laneCount = {};
      return lanes.map((l) => {
      const a = byId[l.from], b = byId[l.to];
      if (!a || !b) return null;
      const key = [l.from, l.to].sort().join(">");
      const lane = (laneCount[key] = (laneCount[key] || 0) + 1) - 1;
      const rt = nbvRoute(a, b, cardH(a), cardH(b), rects, lane);
      const col = l.tbd ? "#c98d1a"
       : (worstOf(a) === "DOWN" || worstOf(b) === "DOWN") ? "#d4756a" : "#57a773";
      const d = nbvPathD(rt.pts);
      const mx = rt.badge[0], my = rt.badge[1];
      return (
       <g key={l.id}>
        <path d={d} fill="none" stroke={col} strokeWidth={1.6}
         strokeDasharray="5,5" opacity={0.75} />
        <g onClick={() => setSel(sel === l.id ? null : l.id)}
         style={{ cursor: "pointer" }}>
         <circle cx={mx} cy={my} r={8} fill="#fff" stroke={col} strokeWidth={1.6}
          strokeDasharray={l.tbd ? "3,2.4" : "none"} />
         <text x={mx} y={my + 3} fontSize={8.6} fontWeight={900} fill={col}
          textAnchor="middle">{l.tbd ? "?" : "i"}</text></g>
       </g>);
     }); })()}
     {nodes.map((n) => {
      const m = members(n), H = cardH(n), w = worstOf(n);
      const clu = m.length > 1;
      return (
       <g key={n.id} onClick={() => clu && setOpen({ ...open, [n.id]: !open[n.id] })}
        style={{ cursor: clu ? "pointer" : "default" }}>
        <rect x={n.x} y={n.y} width={NBV_W} height={H} rx={9} fill="#fff"
         stroke={n.auto ? "#7b4dbb" : w === "DOWN" ? "#e4a09a" : "#e3eaef"}
         strokeWidth={1.3} strokeDasharray={n.auto ? "5,4" : "none"} />
        <text x={n.x + 10} y={n.y + 17} fontSize={9.6} fontWeight={700} fill="#1c2a3a">
         {n.title}{clu ? " " : ""}
         {clu && <tspan fontSize={7.2} fill="#1168bd">
          [{m.length}]{open[n.id] ? " ▾" : " ▸"}</tspan>}</text>
        <text x={n.x + 10} y={n.y + 31} fontSize={7.4} fill="#93a5b5" style={mono}>
         {(n.sub || "").slice(0, 34)}</text>
        {w && !n.bare && <circle cx={n.x + NBV_W - 11} cy={n.y + 11} r={4.2}
         fill={w === "WAIT" ? "#fff" : NBV_DOT[w] || "#9aa7b2"}
         stroke={w === "WAIT" ? "#9aa7b2" : "none"} strokeWidth={1.4}
         strokeDasharray={w === "WAIT" ? "2.2,1.8" : "none"} />}
        {clu && open[n.id] && m.map(([nm, st2], k2) => (
         <g key={nm}>
          <text x={n.x + 16} y={n.y + 50 + k2 * 20} fontSize={7.6} fill="#5a6c7d"
           style={mono}>{nm}</text>
          <circle cx={n.x + NBV_W - 14} cy={n.y + 46 + k2 * 20} r={3.4}
           fill={st2 === "WAIT" ? "#fff" : NBV_DOT[st2]}
           stroke={st2 === "WAIT" ? "#9aa7b2" : "none"} strokeWidth={1.2}
           strokeDasharray={st2 === "WAIT" ? "2,1.6" : "none"} /></g>))}
        {clu && !open[n.id] && (() => {
         const ok = m.filter((x) => x[1] === "OK").length;
         const bad = m.filter((x) => x[1] === "DOWN").length;
         const wt = m.length - ok - bad;
         let sx = n.x + 10;
         return [["#2fb344", ok], ["#d43a3a", bad], ["#9aa7b2", wt]]
          .filter((p) => p[1]).map((p, k3) => {
           const el = (
            <g key={k3}>
             <circle cx={sx + 3} cy={n.y + H - 9} r={3.2} fill={p[0]} />
             <text x={sx + 9} y={n.y + H - 6} fontSize={7.4}
              fill="#7d93a8">{p[1]}</text></g>);
           sx += 22; return el;
          });
        })()}
        {n.auto && <><rect x={n.x + NBV_W - 50} y={n.y + H - 14} width={42}
          height={11} rx={5.5} fill="#7b4dbb" />
         <text x={n.x + NBV_W - 29} y={n.y + H - 5.5} fontSize={7} fontWeight={800}
          fill="#fff" textAnchor="middle">AUTO</text></>}
       </g>);
     })}
     {sel && (() => {
      const l = lanes.find((x) => x.id === sel); if (!l) return null;
      const a = byId[l.from], b = byId[l.to]; if (!a || !b) return null;
      const px = Math.min(Math.max((a.x + b.x) / 2 - 110, 30), 1190);
      const py = Math.min(Math.max((a.y + b.y) / 2 + 16, 50), 550);
      const st = (live["path." + l.id] || {}).st;
      return (
       <g onClick={() => setSel(null)} style={{ cursor: "pointer" }}>
        <rect x={px} y={py} width={250} height={70} rx={10} fill="#10193b" />
        <text x={px + 12} y={py + 18} fontSize={9} fontWeight={800} fill="#7cc0ff"
         letterSpacing={1}>{sel.toUpperCase()}  ·  ✕</text>
        <text x={px + 12} y={py + 36} fontSize={9} fill="#e6eef6" style={mono}>
         {l.from} → {l.to}  ·  {l.rule || "internal"}</text>
        <text x={px + 12} y={py + 54} fontSize={8.4} fill="#b9c9d8">
         {l.tbd ? "◌ awaiting firewall decision"
          : l.probe ? "path " + (st || "no result yet") + " · " + l.probe
          : "context lane"}</text>
       </g>);
     })()}
    </svg>
   </div>
   <div style={{ padding: "7px 13px", fontSize: 10.5, color: t.sub }}>
    nodes/lanes from env_infra (AUTO dashed purple) · clusters collapsed — click to
    expand · rollup strip = member health · statuses via /env-infra/probes/live</div>
  </div>);
}

/* ========================= NETWORK TAB (zone-layered) ========================= */
// The canonical network/infra-defense view: trust bands north->south, firewall
// bars between them, every crossing = a rule badge (click -> popover, synced to
// the rulebase table). Data: GET /env-infra (nodes+zones) + /env-infra/rules.
// Component view kept as the toggle. Zero data-flow narrative — that stays on
// the Overview board. Layout maps are presentation-only.

const NT_BANDS = [["UNTRUSTED · INTERNET / VENDOR", 30, 90, "#fdf3f3"],
 ["DMZ", 150, 110, "#f4f8fb"], ["APPLICATION", 290, 180, "#eef4f9"],
 ["DATA · restricted", 500, 100, "#f4f8fb"]];
const NT_FW = [["FW-EDGE", 144], ["FW-DMZ", 284], ["FW-DATA", 494]];
const NT_POS = { "SEI SWP": [640, 56], "CRD": [830, 56], "secureftp drop": [120, 196],
 "Momentum MFT": [320, 196], "Apigee Gateway": [640, 196], "CPHUB Landing": [120, 336],
 "CP Integration Hub": [370, 322], "Pivotal": [640, 322], "Client Portal": [640, 396],
 "IMDS": [300, 528], "PBDW": [530, 528], "PingFederate": [120, 466],
 "User subnets": [120, 396] };
const NT_COMP = { DATA_MOVEMENT: [90, 150, 240, ["secureftp drop", "Momentum MFT"]],
 FILE_SHARE: [370, 150, 200, ["CPHUB Landing"]],
 INTEGRATION_HUB: [370, 300, 240, ["CP Integration Hub"]],
 DATA_HUB: [640, 150, 240, ["IMDS", "PBDW"]],
 CONSUMERS: [640, 300, 240, ["Pivotal", "Client Portal", "CRD"]],
 GATEWAY_IDENTITY: [90, 300, 240, ["Apigee Gateway", "PingFederate"]] };
const ntCol = (st) => st === "VERIFIED" ? "#159943" : st === "APPROVED" ? "#0b6a8a" : "#c98d1a";

export function NetworkTab({ t }) {
 const [view, setView] = useState("zones");
 const [proj, setProj] = useState("SEI");
 const [rules, setRules] = useState(null);
 const [rows, setRows] = useState([]);
 const [sel, setSel] = useState(null);
 useEffect(() => {
  api.envInfraRules("DEV", proj).then(setRules);
  api.envInfra().then((d) => { if (d && !d.error)
   setRows(Object.values(d.environments || {}).flat()); });
 }, [proj]);
 if (!rules) return <div style={{ padding: 30, fontSize: 12, color: "#7b8894",
  textAlign: "center" }}>Loading rulebase…</div>;
 const demo = rules.length && rules[0].mode === "DEMO";
 const hostOf = (name) => {
  const r = rows.find((x) => x.system_name === name);
  return r ? (r.hosts || "").slice(0, 24) : "";
 };
 const geo = (r, i) => {                          // badge + path per view
  if (view === "zones") {
   const a = NT_POS[r.src_system], b = NT_POS[r.dst_system];
   if (!a || !b) return null;
   const vert = Math.abs(a[1] - b[1]) > 30;
   const p1 = vert ? [a[0] + 80, a[1] + (a[1] < b[1] ? 44 : 0)] : [a[0] + (a[0] < b[0] ? 160 : 0), a[1] + 22];
   const p2 = vert ? [b[0] + 80, b[1] + (a[1] < b[1] ? 0 : 44)] : [b[0] + (a[0] < b[0] ? 0 : 160), b[1] + 22];
   const my = (p1[1] + p2[1]) / 2;
   return { d: `M ${p1[0]} ${p1[1]} L ${p1[0]} ${my} L ${p2[0]} ${my} L ${p2[0]} ${p2[1]}`,
            bx: p1[0], by: my };
  }
  const findC = (n) => Object.entries(NT_COMP).find(([, c]) => c[3].includes(n));
  const A = findC(r.src_system), B = findC(r.dst_system);
  if (!A || !B || A[0] === B[0]) return null;
  const a = A[1], b = B[1];
  const p1 = [a[0] + a[2] / 2, a[1] + 130], p2 = [b[0] + b[2] / 2, b[1]];
  const horiz = Math.abs(a[1] - b[1]) < 20;
  const q1 = horiz ? [a[0] + (a[0] < b[0] ? a[2] : 0), a[1] + 65] : p1;
  const q2 = horiz ? [b[0] + (a[0] < b[0] ? 0 : b[2]), b[1] + 65] : p2;
  const mx = (q1[0] + q2[0]) / 2, my = (q1[1] + q2[1]) / 2;
  return { d: `M ${q1[0]} ${q1[1]} L ${mx} ${q1[1]} L ${mx} ${q2[1]} L ${q2[0]} ${q2[1]}`,
           bx: mx, by: my };
 };
 const pill = (on) => ({ fontSize: 10.5, fontWeight: 700, padding: "4px 13px",
  borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? t.accent : t.border}`,
  background: on ? t.accent : "#fff", color: on ? "#fff" : t.sub });
 return (
  <div>
   <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10,
    flexWrap: "wrap" }}>
    <b style={{ fontSize: 11, textTransform: "uppercase", color: "#0f4775" }}>Network</b>
    <span style={pill(view === "zones")} onClick={() => { setView("zones"); setSel(null); }}>
     Zones (network team)</span>
    <span style={pill(view === "comp")} onClick={() => { setView("comp"); setSel(null); }}>
     Components</span>
    <span style={{ width: 14 }} />
    {["SEI", "ADDVANTAGE", "SHARED", "ALL"].map((p) => (
     <span key={p} style={pill(proj === p)} onClick={() => { setProj(p); setSel(null); }}>{p}</span>))}
    {demo && <Chip tone="amber">○ DEMO</Chip>}
    <span style={{ marginLeft: "auto", fontSize: 9.5, color: t.sub }}>
     ✓ verified · i approved · ? TBD — click badges or rows · not listed = DENIED</span>
   </div>
   <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 12,
    alignItems: "start" }}>
    <div style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 6,
     overflow: "hidden" }}>
     <svg viewBox="0 0 980 640" style={{ width: "100%", display: "block" }}>
      {view === "zones" && <>
       {NT_BANDS.map((z) => (
        <g key={z[0]}>
         <rect x={70} y={z[1]} width={880} height={z[2]} rx={8} fill={z[3]} stroke="#dfe6ec" />
         <text x={80} y={z[1] + 16} fontSize={8.4} fontWeight={800} fill="#8aa0b4"
          letterSpacing={1.4}>{z[0]}</text></g>))}
       {NT_FW.map((f) => (
        <g key={f[0]}>
         <line x1={70} y1={f[1]} x2={950} y2={f[1]} stroke="#c96a76" strokeWidth={2.5}
          strokeDasharray="4,7" />
         <rect x={880} y={f[1] - 7} width={64} height={14} rx={7} fill="#a34250" />
         <text x={912} y={f[1] + 3.5} fontSize={7.6} fontWeight={800} fill="#fff"
          textAnchor="middle">{f[0]}</text></g>))}
       <rect x={74} y={380} width={214} height={190} rx={8} fill="none" stroke="#c9d6e0"
        strokeDasharray="6,5" />
       <text x={84} y={396} fontSize={7.8} fontWeight={800} fill="#8aa0b4">CORP · USER / IDENTITY</text>
      </>}
      {view === "comp" && Object.entries(NT_COMP).map(([name, c]) => (
       <g key={name}>
        <rect x={c[0]} y={c[1]} width={c[2]} height={130} rx={12} fill="#fff"
         stroke={name === "INTEGRATION_HUB" ? "#c1113a" : "#9db4ca"} strokeWidth={1.7} />
        <text x={c[0] + 12} y={c[1] + 20} fontSize={10.5} fontWeight={800} fill="#10193b"
         letterSpacing={0.8}>{name.replace("_", " ")}</text>
        {c[3].map((m, i) => (
         <g key={m}>
          <rect x={c[0] + 10} y={c[1] + 28 + i * 26} width={c[2] - 20} height={21} rx={5}
           fill="#f4f8fb" stroke="#e4ebf1" />
          <text x={c[0] + 17} y={c[1] + 42 + i * 26} fontSize={8.8} fill="#41566b"
           fontFamily="Consolas,monospace">{m} {hostOf(m) && "· " + hostOf(m)}</text></g>))}
       </g>))}
      {view === "zones" && Object.entries(NT_POS).map(([name, p]) => (
       <g key={name}>
        <rect x={p[0]} y={p[1]} width={160} height={44} rx={8} fill="#fff"
         stroke={name === "CP Integration Hub" ? "#c1113a" : "#c9d6e0"} strokeWidth={1.4} />
        <text x={p[0] + 10} y={p[1] + 19} fontSize={9.6} fontWeight={700}
         fill="#10193b">{name}</text>
        <text x={p[0] + 10} y={p[1] + 34} fontSize={7.4} fill="#8aa0b4"
         fontFamily="Consolas,monospace">{hostOf(name)}</text></g>))}
      {rules.map((r, i) => {
       const g = geo(r, i); if (!g) return null;
       const col = ntCol(r.state);
       return (
        <g key={i}>
         <path d={g.d} fill="none" stroke={col} strokeWidth={1.5}
          strokeDasharray={r.state === "TBD" ? "2,4" : "none"} opacity={0.85} />
         <g onClick={() => setSel(sel === i ? null : i)} style={{ cursor: "pointer" }}>
          <circle cx={g.bx} cy={g.by} r={9} fill={r.state === "TBD" ? "#f0b445" : "#fff"}
           stroke={col} strokeWidth={1.8} />
          <text x={g.bx} y={g.by + 3.5} fontSize={9.5} fontWeight={900} textAnchor="middle"
           fill={r.state === "TBD" ? "#141a26" : col}>
           {r.state === "VERIFIED" ? "✓" : r.state === "APPROVED" ? "i" : "?"}</text></g>
        </g>);
      })}
      {sel != null && (() => {
       const r = rules[sel], g = geo(r, sel); if (!g) return null;
       const px = Math.min(Math.max(g.bx - 105, 76), 740), py = Math.min(g.by + 14, 550);
       const st = r.state === "VERIFIED" ? "✓ VERIFIED · live probe passes"
        : r.state === "APPROVED" ? "APPROVED · granted, unproven"
        : "◌ TBD · port unknown — firewall ask open";
       return (
        <g onClick={() => setSel(null)} style={{ cursor: "pointer" }}>
         <rect x={px} y={py} width={220} height={64} rx={9} fill="#10193b" />
         <text x={px + 11} y={py + 17} fontSize={8.6} fontWeight={800} fill="#7cc0ff"
          letterSpacing={1}>RULE {sel + 1}  ·  ✕</text>
         <text x={px + 11} y={py + 33} fontSize={9} fill="#e6eef6"
          fontFamily="Consolas,monospace">{r.src_system} → {r.dst_system}  {r.port_proto}</text>
         <text x={px + 11} y={py + 50} fontSize={8.2} fill="#b9c9d8">{st}</text></g>);
      })()}
     </svg>
    </div>
    <div style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 6,
     padding: "10px 12px", maxHeight: 640, overflow: "auto" }}>
     <b style={{ fontSize: 10, color: "#0f4775", letterSpacing: 1 }}>
      FIREWALL RULEBASE · /env-infra/rules</b>
     <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 6 }}>
      <thead><tr>{["#", "src", "dst", "port", "state"].map((h) => (
       <th key={h} style={{ textAlign: "left", fontSize: 8.6, textTransform: "uppercase",
        color: t.sub, padding: "5px 7px", borderBottom: `1.5px solid ${t.panel2}` }}>{h}</th>))}
      </tr></thead>
      <tbody>
      {rules.map((r, i) => (
       <tr key={i} onClick={() => setSel(sel === i ? null : i)}
        style={{ cursor: "pointer", background: sel === i ? "#eef6ff" : "" }}>
        <td style={{ padding: "4px 7px", fontSize: 9.6, ...mono }}>{i + 1}</td>
        <td style={{ padding: "4px 7px", fontSize: 9.6, ...mono }}>{r.src_system}</td>
        <td style={{ padding: "4px 7px", fontSize: 9.6, ...mono }}>{r.dst_system}</td>
        <td style={{ padding: "4px 7px", fontSize: 9.6, ...mono }}>{r.port_proto}</td>
        <td style={{ padding: "4px 7px" }}>
         <Chip tone={r.state === "VERIFIED" ? "green" : r.state === "APPROVED" ? "grey" : "tbd"}>
          {r.state === "VERIFIED" ? "✓ VERIFIED" : r.state === "APPROVED" ? "APPROVED" : "◌ TBD"}</Chip></td>
       </tr>))}
      </tbody>
     </table>
     <div style={{ fontSize: 9, color: t.sub, marginTop: 8, lineHeight: 1.7 }}>
      anything not in this table is DENIED · APPROVED auto-upgrades to VERIFIED
      when the path probe passes</div>
    </div>
   </div>
  </div>);
}


/* ================= HEALTH TAB — inventory-synced live dashboard ================= */
// Every row IS an env_infra row; statuses from /env-infra/probes/live (5s poll).
// Sparklines accumulate client-side from successive polls (no history endpoint).

const HT_TILE = (bg, n, label, small) => (
 <div style={{ borderRadius: 8, padding: "12px 14px", color: "#fff", background: bg }}>
  <b style={{ fontSize: 26 }}>{n}</b>
  <div style={{ fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.6,
   opacity: 0.9 }}>{label}</div>
  <small style={{ fontSize: 8.6, opacity: 0.75 }}>{small}</small>
 </div>);
const htChip = (st) => {
 const m = { OK: ["#d0ebd9", "#159943", "OK"], WARN: ["#fdeccd", "#b9770e", "WARN"],
  DOWN: ["#f3d2d7", "#c1113a", "DOWN"], WAIT: ["#fff", "#7d93a8", "◌ WAITING"] };
 const [bg, fg, tx] = m[st] || m.WAIT;
 return <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px",
  borderRadius: 999, background: bg, color: fg,
  border: st === "WAIT" ? "1.5px dashed #9aa7b2" : "none" }}>{tx}</span>;
};
const htSpark = (v, col) => {
 if (!v || v.length < 2) return null;
 const mx = Math.max(...v), mn = Math.min(...v);
 const pts = v.map((x, i) => `${i * 12},${18 - ((x - mn) / (mx - mn || 1)) * 14}`)
  .join(" ");
 return <svg width={80} height={20} style={{ verticalAlign: "middle" }}>
  <polyline points={pts} fill="none" stroke={col} strokeWidth={1.6} /></svg>;
};

export function HealthTab({ t }) {
 const [envSel, setEnvSel] = useState("DEV");
 const [rows, setRows] = useState([]);
 const [live, setLive] = useState({});
 const [hist, setHist] = useState({});
 const [filter, setFilter] = useState("all");
 useEffect(() => { api.envInfra().then((d) => { if (d && !d.error)
  setRows((d.environments || {})[envSel] || []); }); }, [envSel]);
 useEffect(() => {
  const beat = () => api.envProbesLive(envSel).then((l) => {
   if (!l || l.error) return;
   const m = {}, h2 = { ...hist };
   (l || []).forEach((r) => {
    m[r.probe_id] = r;
    if (r.latency_ms != null)
     h2[r.probe_id] = [...(h2[r.probe_id] || []).slice(-6), r.latency_ms];
   });
   setLive(m); setHist(h2);
  });
  beat(); const h = setInterval(beat, 5000); return () => clearInterval(h);
 }, [envSel]);   // eslint-disable-line
 const probeOf = (r) => {
  const hit = Object.values(live).find((p) =>
   p.probe_id.startsWith(envSel) && (p.probe_id.includes(
    (r.system_name || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8))
    || (r.system_name || "").toLowerCase().includes(
     p.probe_id.split(".").pop().slice(0, 6))));
  return hit;
 };
 const items = rows.map((r) => {
  const p = probeOf(r);
  const st = !p ? "WAIT" : p.state === "WAITING" || p.status === "SKIP" ? "WAIT"
   : (p.status || "OK");
  return { r, p, st,
   kind: p ? (p.check_type || "").split(":")[0] : "—",
   lat: p && p.latency_ms, det: p ? (p.detail || "") : (
    (r.protocol_port || "TBD").toUpperCase().includes("TBD")
     ? "arm by setting Protocol_Port in Inventory" : "no probe yet"),
   spark: p ? hist[p.probe_id] : null };
 });
 const shown = items.filter((x) => filter === "all"
  || (filter === "issues" && (x.st === "WARN" || x.st === "DOWN"))
  || (filter === "wait" && x.st === "WAIT"));
 const cnt = (s2) => items.filter((x) => x.st === s2).length;
 const zones = [...new Set(shown.map((x) => x.r.zone || x.r.layer || "OTHER"))];
 const pill = (on) => ({ fontSize: 10.5, fontWeight: 700, padding: "3px 12px",
  borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? t.navy : t.border}`,
  background: on ? t.navy : "#fff", color: on ? "#fff" : t.sub });
 return (
  <div>
   <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 11,
    flexWrap: "wrap" }}>
    {["DEV", "SIT", "TRIAL_UAT", "PROD"].map((e) => (
     <span key={e} style={pill(envSel === e)}
      onClick={() => setEnvSel(e)}>{e.replace("_", "/")}</span>))}
    <span style={{ width: 10 }} />
    {[["all", "All"], ["issues", "Issues only"], ["wait", "Waiting"]].map(([k, l2]) => (
     <span key={k} style={pill(filter === k)} onClick={() => setFilter(k)}>{l2}</span>))}
    <span style={{ marginLeft: "auto", fontSize: 9, color: t.sub }}>
     every system IS an inventory row · probes regenerate on upload · 5s refresh</span>
   </div>
   <div style={{ display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 11,
    marginBottom: 13 }}>
    {HT_TILE("linear-gradient(135deg,#159943,#0d7a32)", cnt("OK"), "passing",
      `of ${items.length} systems`)}
    {HT_TILE("linear-gradient(135deg,#e8a013,#c9820a)", cnt("WARN"), "warning", "")}
    {HT_TILE("linear-gradient(135deg,#c1113a,#96082a)", cnt("DOWN"), "down", "")}
    {HT_TILE("linear-gradient(135deg,#7d93a8,#5c6b7a)", cnt("WAIT"), "waiting",
      "◌ ports TBD in Inventory")}
   </div>
   {zones.map((z) => (
    <div key={z}>
     <div style={{ fontSize: 10, fontWeight: 800, color: "#0f4775",
      letterSpacing: 1.2, textTransform: "uppercase", margin: "16px 0 8px" }}>{z}</div>
     <div style={{ background: "#fff", border: `1px solid ${t.border}`,
      borderRadius: 8 }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}><tbody>
       {shown.filter((x) => (x.r.zone || x.r.layer || "OTHER") === z).map((x, i) => {
        const col = x.st === "OK" ? "#159943" : x.st === "WARN" ? "#e8a013"
         : x.st === "DOWN" ? "#c1113a" : "#9aa7b2";
        return (
         <tr key={i} style={{ borderBottom: `1px solid ${t.panel2}` }}>
          <td style={{ padding: "7px 11px", width: 200 }}>
           <b style={{ fontSize: 10.5 }}>{x.r.system_name}</b>
           <div style={{ ...mono, fontSize: 8.6, color: "#93a5b5" }}>
            {(x.r.hosts || "").slice(0, 40)}</div></td>
          <td style={{ width: 70, padding: "7px 6px" }}>
           <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px",
            borderRadius: 999, background: "#eef2f6", color: "#5c6b7a" }}>
            {x.kind}</span></td>
          <td style={{ width: 100, padding: "7px 6px" }}>{htChip(x.st)}</td>
          <td style={{ width: 80, padding: "7px 6px", ...mono, fontSize: 10 }}>
           {x.lat != null ? x.lat + "ms" : "—"}</td>
          <td style={{ width: 96, padding: "7px 6px" }}>{htSpark(x.spark, col)}</td>
          <td style={{ padding: "7px 11px", fontSize: 9.6,
           color: x.st === "WAIT" ? "#7d93a8" : "#5a6c7d" }}>{x.det}</td>
         </tr>);
       })}
      </tbody></table>
     </div>
    </div>))}
  </div>);
}

/* ================= CERTS TAB — dual-source certificate register ================= */
// Sources: workbook SSL_Expiry (env_infra rows) + live TLS observations (probe
// detail "expires in Nd"). Unmonitored = 443 rows with neither.

export function CertsTab({ t }) {
 const [rows, setRows] = useState([]);
 const [live, setLive] = useState([]);
 useEffect(() => {
  api.envInfra().then((d) => { if (d && !d.error)
   setRows(Object.values(d.environments || {}).flat()); });
  api.envProbesLive("DEV").then((l) => { if (l && !l.error) setLive(l || []); });
 }, []);
 const days = (s2) => { if (!s2) return null;
  const d = Math.round((new Date(s2) - Date.now()) / 86400000);
  return isNaN(d) ? null : d; };
 const certs = [];
 rows.forEach((r) => { const d = days(r.ssl_expiry);
  if (d != null) certs.push({ sys: r.system_name, ep: (r.hosts || "").slice(0, 40),
   env: r.env, src: "workbook SSL_Expiry", d }); });
 live.forEach((p) => { const m = /expires in (\d+)d/.exec(p.detail || "");
  if (m) certs.push({ sys: p.probe_id, ep: p.target_host || p.probe_id,
   env: p.probe_id.split(".")[0], src: "live TLS probe", d: +m[1] }); });
 certs.sort((a, b) => a.d - b.d);
 const un = rows.filter((r) => (r.protocol_port || "").includes("443")
  && days(r.ssl_expiry) == null
  && !certs.some((c) => c.sys === r.system_name));
 const bucket = (lo, hi) => certs.filter((c) => c.d > lo && c.d <= hi).length;
 return (
  <div>
   <div style={{ display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 11,
    marginBottom: 13 }}>
    {HT_TILE("linear-gradient(135deg,#c1113a,#96082a)", bucket(-9999, 7),
      "critical ≤ 7 days", "renew NOW")}
    {HT_TILE("linear-gradient(135deg,#e8a013,#c9820a)", bucket(7, 30),
      "warning ≤ 30 days", "")}
    {HT_TILE("linear-gradient(135deg,#159943,#0d7a32)", bucket(30, 99999),
      "healthy", "")}
    {HT_TILE("linear-gradient(135deg,#7d93a8,#5c6b7a)", un.length,
      "unmonitored 443", "add SSL_Expiry in Inventory")}
   </div>
   <div style={{ fontSize: 10, fontWeight: 800, color: "#0f4775", letterSpacing: 1.2,
    textTransform: "uppercase", margin: "4px 0 8px" }}>Expiry horizon · next 90 days</div>
   <div style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 8,
    padding: 14 }}>
    <svg viewBox="0 0 1200 96" style={{ width: "100%" }}>
     <line x1={20} y1={60} x2={1180} y2={60} stroke="#dfe6ec" strokeWidth={2} />
     <rect x={20} y={56} width={7 / 90 * 1160} height={8} fill="#c1113a"
      opacity={0.12} />
     <rect x={20 + 7 / 90 * 1160} y={56} width={23 / 90 * 1160} height={8}
      fill="#e8a013" opacity={0.12} />
     {[0, 7, 30, 60, 90].map((d) => (
      <g key={d}>
       <line x1={20 + d / 90 * 1160} y1={54} x2={20 + d / 90 * 1160} y2={66}
        stroke="#c9d6e0" />
       <text x={20 + d / 90 * 1160} y={82} fontSize={9} fill="#8fa3b5"
        textAnchor="middle">{d ? d + "d" : "today"}</text></g>))}
     {certs.map((c, i) => {
      const x = 20 + Math.min(Math.max(c.d, 0), 90) / 90 * 1160;
      const col = c.d <= 7 ? "#c1113a" : c.d <= 30 ? "#e8a013" : "#159943";
      return (
       <g key={i}>
        <circle cx={x} cy={60} r={7} fill={col} />
        <text x={x} y={40 - (i % 2) * 14} fontSize={8.6} fill="#41566b"
         textAnchor="middle">{String(c.sys).slice(0, 18)}</text>
        <text x={x} y={50} fontSize={8} fill={col} fontWeight={800}
         textAnchor="middle">{c.d}d</text></g>);
     })}
    </svg>
   </div>
   <div style={{ fontSize: 10, fontWeight: 800, color: "#0f4775", letterSpacing: 1.2,
    textTransform: "uppercase", margin: "16px 0 8px" }}>Certificates</div>
   <div style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 8 }}>
    <table style={{ borderCollapse: "collapse", width: "100%" }}><tbody>
     {certs.map((c, i) => (
      <tr key={i} style={{ borderBottom: `1px solid ${t.panel2}` }}>
       <td style={{ padding: "7px 11px" }}><b style={{ fontSize: 10.5 }}>{c.sys}</b></td>
       <td style={{ padding: "7px 11px", ...mono, fontSize: 9.4 }}>{c.ep}</td>
       <td style={{ padding: "7px 11px", fontSize: 10 }}>{c.env}</td>
       <td style={{ padding: "7px 11px", fontSize: 9.4, color: t.sub }}>{c.src}</td>
       <td style={{ padding: "7px 11px" }}>
        <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 8px",
         borderRadius: 999,
         background: c.d <= 7 ? "#f3d2d7" : c.d <= 30 ? "#fdeccd" : "#d0ebd9",
         color: c.d <= 7 ? "#c1113a" : c.d <= 30 ? "#b9770e" : "#159943" }}>
         {c.d} days</span></td>
      </tr>))}
    </tbody></table>
   </div>
   <div style={{ fontSize: 10, fontWeight: 800, color: "#b9770e", letterSpacing: 1.2,
    textTransform: "uppercase", margin: "16px 0 8px" }}>
    ⚠ Unmonitored TLS surfaces — 443 rows with no cert data</div>
   <div style={{ background: "#fff", border: `1px solid ${t.border}`, borderRadius: 8 }}>
    <table style={{ borderCollapse: "collapse", width: "100%" }}><tbody>
     {un.map((r, i) => (
      <tr key={i} style={{ borderBottom: `1px solid ${t.panel2}` }}>
       <td style={{ padding: "7px 11px", width: 220 }}>
        <b style={{ fontSize: 10.5 }}>{r.system_name}</b></td>
       <td style={{ padding: "7px 11px", ...mono, fontSize: 9.4 }}>
        {(r.hosts || "").slice(0, 44)}</td>
       <td style={{ padding: "7px 11px", fontSize: 9.6, color: t.sub }}>
        {r.env} · add SSL_Expiry in Inventory or arm a TLS probe</td>
      </tr>))}
    </tbody></table>
   </div>
  </div>);
}

// Merge into api.js — Environment 360 infrastructure (DB-backed, DEMO→LIVE).
// House pattern: every call tries LIVE (/env-infra/*); on failure it serves the
// embedded DEMO dataset (tagged mode:"DEMO") so the UI always renders, and
// demo writes mutate the in-memory store so the save→probe loop still demos.

const API_BASE = "/api";   // matches the app's vite proxy / server mount

/* ------------------------------ DEMO store ------------------------------ */
const _E = ["DEV", "SIT", "TRIAL_UAT", "PROD"];
const _SPEC = {   // per-env host substitutions for the 10 canonical rows
 DEV:{hub:"OCPQ RD-DEV namespace",imds:"dvlimdsdb.testbbh.com; dvlimdsapp",pbdw:"dvlpbdb1.testbbh.com; rtlodiapp3t",
  piv:"QCWPIVDEVSEI2; QCWPIVDEVSEI4; QCWPIVDEVSEI5",portal:"dvltasap235.testbbh.com",share:"\\\\rdwebfs\\cphub$",sftp:"qcsecureftp.bbh.com"},
 SIT:{hub:"OCPQ RD-SIT namespace",imds:"qblimdsdb; qblimdsapp",pbdw:"QALPBDB3; qalodiapp3sei; qalodidb3sei",
  piv:"QCWPIVAPMTRSEI; SEIDB6; INTSEI1",portal:"rdltasap235.testbbh.com",share:"\\\\rdwebfs\\cphub$",sftp:"qcsecureftp.bbh.com"},
 TRIAL_UAT:{hub:"OCPQ QC namespace",imds:"rdlimdsdb; rdlimdsapp",pbdw:"QCLPBDB3; qclodiapp3sei; qclodidb3sei",
  piv:"AUPGSEI1/2; SEIDB4/5; INTSEI2",portal:"qcltasap235.testbbh.com",share:"\\\\qcwebfs\\cphub$",sftp:"qcsecureftp.bbh.com"},
 PROD:{hub:"Production cluster TBD",imds:"njlimdsdb.bbh.com; njlimdsapp",pbdw:"njlpbdb3; njlodiapp3sei; njlodidb3sei",
  piv:"NJWPIVCRM x6",portal:"njtasap12 x4",share:"prod cphub share TBD",sftp:"secureftp.bbh.com"}};
function _mkRows(){
 const out=[];
 _E.forEach(e=>{const p=_SPEC[e];
  [["Platform","CP Integration Hub",p.hub,"4 GB","2","10GB","TBD",""],
   ["File System","CPHUB Landing Share",p.share,"","","20GB","TBD",""],
   ["Database","IMDS",p.imds,"62 GB","8","6 TB","Oracle JDBC port TBD",""],
   ["Database","PBDW",p.pbdw,"62 GB","8","4 TB","TBD",""],
   ["Consumer","Pivotal",p.piv,"16 GB","4","C100 D250","TBD",""],
   ["Consumer","CRD","Azure-hosted vendor application","","","","TBD",""],
   ["Consumer","Client Portal",p.portal,"12 GB","2","350 GB","TBD",
    e==="DEV"?new Date(Date.now()+6*864e5).toISOString().slice(0,10):""],
   ["Consumer","PORT","New PORT test instance","","","25 accts","TBD",""],
   ["External SFTP","SEI to BBH SFTP",p.sftp,"","","","SFTP 22",""],
   ["External API","SEI API Proxy Egress","192.200.8.0/24; 192.200.5.0/24; 204.136.26.0/24","","","","HTTPS 443",""]]
  .forEach(r=>out.push({env:e,layer:r[0],system_name:r[1],hosts:r[2],sizing_ram:r[3],
   sizing_cpu:r[4],sizing_storage:r[5],growth:"TBD",hosting:"BBH",direction:"",
   protocol_port:r[6],notes:"demo",ssl_expiry:r[7]}));});
 return out;
}
let DEMO_ROWS = _mkRows();
const _tbd = (p) => !p || p.toUpperCase().includes("TBD");
const _port = (p) => { const m=(p||"").match(/(\d{2,5})/); return _tbd(p)?null:(m&&m[1]); };

const _NODEQ = {"dmz.mft":["External SFTP","SFTP"],"dmz.cifs":["File System","Landing"],
 "app.hub":["Platform","Integration Hub"],"data.imds":["Database","IMDS"],
 "data.pbdw":["Database","PBDW"],"cons.piv":["Consumer","Pivotal"],
 "cons.portal":["Consumer","Client Portal"],"cons.vendor":["Consumer","CRD"],
 "ext.seiapi":["External API","Egress"]};
const _LANES=[["sei-mft","ext.sei","dmz.mft",["External SFTP","SFTP"]],
 ["mft-cifs","dmz.mft","dmz.cifs",null],["cifs-hub","dmz.cifs","app.hub",["File System","Landing"]],
 ["hub-imds","app.hub","data.imds",["Database","IMDS"]],["hub-pbdw","app.hub","data.pbdw",["Database","PBDW"]],
 ["pbdw-piv","data.pbdw","cons.piv",["Consumer","Pivotal"]],["pbdw-portal","data.pbdw","cons.portal",["Consumer","Client Portal"]],
 ["out-apigee","app.out","dmz.apigee",null],["apigee-sei","dmz.apigee","ext.seiapi",["External API","Egress"]],
 ["apigee-vendor","dmz.apigee","cons.vendor",["Consumer","CRD"]]];
const _ZONE={"Database":"DATA ZONE","Consumer":"CONSUMERS","File System":"DMZ · MFT / EGRESS",
 "Platform":"CP INTEGRATION HUB · OPENSHIFT","External API":"EXTERNAL","External SFTP":"EXTERNAL"};
function _fRow(env,l,f){return DEMO_ROWS.find(r=>r.env===env&&r.layer===l&&r.system_name.includes(f));}
function _demoTopology(env){
 const known=new Set(); const nodes=[];
 Object.entries(_NODEQ).forEach(([id,[l,f]])=>{const r=_fRow(env,l,f);
  if(!r)return; known.add(r.layer+"|"+r.system_name);
  nodes.push({id,zone:_ZONE[l]||"",icon:"",title:r.system_name,sub:r.hosts.slice(0,28),
   probe:id,tbd:_tbd(r.protocol_port)});});
 ["corp.users","corp.f5","mgmt.stack","app.ingress","app.envoy","app.out","dmz.apigee","ext.sei"]
  .forEach(id=>nodes.push({id,zone:"",icon:"",title:{"corp.users":"Users · analysts","corp.f5":"F5 / LTM VIP",
   "mgmt.stack":"Splunk · Vault · OIDC","app.ingress":"OCP ingress","app.envoy":"Envoy data plane",
   "app.out":"Outbound producers","dmz.apigee":"Apigee egress","ext.sei":"SEI SWP"}[id],
   sub:"",probe:id,tbd:false}));
 DEMO_ROWS.filter(r=>r.env===env&&!known.has(r.layer+"|"+r.system_name)&&_ZONE[r.layer]&&r.layer!=="Platform")
  .forEach(r=>{const id=(r.layer==="Database"?"data.":r.layer==="Consumer"?"cons.":"ext.")+
   r.system_name.toLowerCase().replace(/[^a-z0-9]/g,"").slice(0,14);
   if(nodes.some(n=>n.id===id))return;
   nodes.push({id,zone:_ZONE[r.layer],icon:"",title:r.system_name,sub:r.hosts.slice(0,28),probe:id,tbd:_tbd(r.protocol_port)});});
 const lanes=_LANES.map(([id,from,to,src])=>{
  const r=src?_fRow(env,src[0],src[1]):null;
  const p=r?_port(r.protocol_port):(src?null:"int");
  return {id,from,to,rule:p||"TBD",tbd:src?!p:false,probe:"path."+id};});
 return {env,mode:"DEMO",nodes,lanes,allowlists:[],asks:[]};
}
function _demoLive(env){
 const t=Math.floor(Date.now()/2600);
 const out=[];
 Object.entries(_NODEQ).forEach(([id,[l,f]],i)=>{const r=_fRow(env,l,f);
  const armed=r&&!_tbd(r.protocol_port);
  const roll=(t*7+i*13)%97;
  out.push({probe_id:env+"."+id,state:armed?"ARMED":"WAITING",
   status:!armed?"SKIP":roll<86?"OK":roll<94?"WARN":"DOWN",latency_ms:12+((t*13+i*29)%120)});});
 ["corp.f5","mgmt.stack","app.ingress","app.envoy","app.out","dmz.apigee"].forEach((id,i)=>{
  const roll=(t*5+i*17)%89;
  out.push({probe_id:env+"."+id,state:"ARMED",status:roll<80?"OK":roll<86?"WARN":"DOWN",
   latency_ms:8+((t*11+i*23)%90)});});
 _LANES.forEach(([id,,,src],i)=>{const r=src?_fRow(env,src[0],src[1]):null;
  const armed=src?(r&&!_tbd(r.protocol_port)):true;
  out.push({probe_id:env+".path."+id,state:armed?"ARMED":"WAITING",
   status:!armed?"SKIP":(((t*5+i*11)%89)<84?"OK":"DOWN"),latency_ms:12+((t*13+i*29)%140)});});
 return out;
}
function _envsShape(){
 const environments={}; DEMO_ROWS.forEach(r=>(environments[r.env]=environments[r.env]||[]).push(r));
 return {mode:"DEMO",environments,
  tbd_count:DEMO_ROWS.filter(r=>_tbd(r.protocol_port)).length};
}
function _counts(){const a=DEMO_ROWS.filter(r=>!_tbd(r.protocol_port)).length;
 return {probes_regenerated:DEMO_ROWS.length+_LANES.length,probes_armed:a,
  probes_waiting:DEMO_ROWS.length+_LANES.length-a};}


const DEMO_RULES = [
 ["SEI SWP","secureftp drop","SFTP 22","v"],["Momentum MFT","secureftp drop","SFTP 22","v"],
 ["Momentum MFT","CPHUB Landing","SMB 445","a"],["CP Integration Hub","CPHUB Landing","CIFS 445","a"],
 ["CP Integration Hub","IMDS","TCP 1521/2484","t"],["CP Integration Hub","PBDW","TCP 1521/2484","t"],
 ["CP Integration Hub","Pivotal","TBD","t"],["Pivotal","CP Integration Hub","TBD","t"],
 ["CP Integration Hub","Client Portal","TBD","t"],["Client Portal","CP Integration Hub","TBD","t"],
 ["CP Integration Hub","Apigee Gateway","TCP 443","v"],["Apigee Gateway","SEI SWP","TCP 443","v"],
 ["Apigee Gateway","CRD","TCP 443","v"],["CP Integration Hub","PingFederate","TCP 443","a"],
 ["User subnets","PingFederate","TCP 443","v"],["User subnets","SEI SWP","TCP 443","v"],
 ["PingFederate","SEI SWP","TCP 443","a"]].map(function(r,i){
  return {project:"SEI",env:"DEV",src_system:r[0],dst_system:r[1],port_proto:r[2],
   direction:"internal",state:r[3]==="v"?"VERIFIED":r[3]==="a"?"APPROVED":"TBD",
   notes:"demo",mode:"DEMO"};});

/* ------------------------------ API surface ------------------------------ */
const _j = (r) => r.ok ? r.json() : r.text().then((x) => Promise.reject(x));
export const envInfraApi = {
  envInfra: () => fetch(API_BASE + "/env-infra").then(_j).catch(() => _envsShape()),
  envInfraTopology: (env) => fetch(`${API_BASE}/env-infra/topology?env=${encodeURIComponent(env)}`)
    .then(_j).catch(() => _demoTopology(env)),
  envProbesLive: (env) => fetch(`${API_BASE}/env-infra/probes/live?env=${encodeURIComponent(env)}`)
    .then(_j).catch(() => _demoLive(env)),
  envInfraRules: (env, project) => fetch(`${API_BASE}/env-infra/rules?` +
    (env ? `env=${encodeURIComponent(env)}&` : "") +
    (project && project !== "ALL" ? `project=${encodeURIComponent(project)}` : ""))
    .then(_j).then((d) => (d && d.length ? d : DEMO_RULES)).catch(() => DEMO_RULES),
  envInfraTbd: () => fetch(API_BASE + "/env-infra/tbd").then(_j)
    .catch(() => DEMO_ROWS.filter(r => _tbd(r.protocol_port))),
  envInfraSaveRow: (row) => fetch(API_BASE + "/env-infra/row", { method: "PUT",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(row) })
    .then(_j).catch(() => {          // DEMO write: mutate store
      const i = DEMO_ROWS.findIndex(r => r.env === row.env &&
        r.layer === row.layer && r.system_name === row.system_name);
      if (i >= 0) DEMO_ROWS[i] = { ...DEMO_ROWS[i], ...row };
      else DEMO_ROWS.push({ growth:"", hosting:"", direction:"", notes:"", ssl_expiry:"", ...row });
      return { ok: true, mode: "DEMO", ..._counts() };
    }),
  envInfraDeleteRow: (r) => fetch(`${API_BASE}/env-infra/row?env=${r.env}&layer=` +
    `${encodeURIComponent(r.layer)}&system_name=${encodeURIComponent(r.system_name)}`,
    { method: "DELETE" }).then(_j).catch(() => {
      DEMO_ROWS = DEMO_ROWS.filter(x => !(x.env === r.env && x.layer === r.layer &&
        x.system_name === r.system_name));
      return { ok: true, mode: "DEMO", ..._counts() };
    }),
  envInfraImport: (file) => { const fd = new FormData(); fd.append("file", file);
    return fetch(API_BASE + "/env-infra/import", { method: "POST", body: fd }).then(_j)
      .catch(() => ({ mode: "DEMO", added: 0, changed: 0, removed: 0, ..._counts(),
        note: "demo mode — upload applies only when the API is live" })); },
  envInfraExportUrl: () => API_BASE + "/env-infra/export",
};
// in api.js:  export const api = { ...existing, ...envInfraApi };

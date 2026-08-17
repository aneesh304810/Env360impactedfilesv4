-- 46_env_network.sql - project/zone/component on nodes + firewall rule registry
-- Idempotent: guarded like 39. Safe to re-run.
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE env_infra ADD (project VARCHAR2(30) DEFAULT ''SEI'')';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF; END;
/
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE env_infra ADD (zone VARCHAR2(30))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF; END;
/
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE env_infra ADD (component VARCHAR2(40))';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF; END;
/
BEGIN
  EXECUTE IMMEDIATE 'ALTER TABLE env_infra ADD (display_order NUMBER)';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -1430 THEN RAISE; END IF; END;
/
BEGIN
  EXECUTE IMMEDIATE '
  CREATE TABLE env_rule (
    project      VARCHAR2(30)  DEFAULT ''SEI'' NOT NULL,
    env          VARCHAR2(20)  NOT NULL,
    src_system   VARCHAR2(120) NOT NULL,
    dst_system   VARCHAR2(120) NOT NULL,
    port_proto   VARCHAR2(60),
    direction    VARCHAR2(20),
    state        VARCHAR2(20) DEFAULT ''TBD'',   -- TBD | APPROVED | VERIFIED (verified set by probes)
    notes        VARCHAR2(400),
    row_hash     VARCHAR2(32),
    updated_at   TIMESTAMP DEFAULT SYSTIMESTAMP,
    updated_by   VARCHAR2(40),
    CONSTRAINT pk_env_rule PRIMARY KEY (project, env, src_system, dst_system, port_proto)
  )';
EXCEPTION WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF; END;
/
BEGIN
  EXECUTE IMMEDIATE '
  CREATE OR REPLACE VIEW v_env_rulebase AS
  SELECT r.project, r.env, r.src_system, r.dst_system, r.port_proto, r.direction,
         CASE WHEN r.state = ''APPROVED''
               AND EXISTS (SELECT 1 FROM env_probe p
                           JOIN env_probe_result q ON q.probe_id = p.probe_id
                           WHERE p.env = r.env
                             AND q.status = ''OK''
                             AND q.run_ts > SYSTIMESTAMP - INTERVAL ''1'' HOUR
                             AND p.probe_id LIKE r.env || ''.path.%'')
              THEN ''VERIFIED'' ELSE r.state END AS state,
         r.notes
  FROM env_rule r';
EXCEPTION WHEN OTHERS THEN RAISE; END;
/

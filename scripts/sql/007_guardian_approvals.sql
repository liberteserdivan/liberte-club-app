-- Liberte Guardian — Approval Autopilot kalıcılık ÖNERİSİ (007)
-- DURUM: ÖNERİ / TASLAK. BU MIGRATION OTOMATİK UYGULANMAZ.
-- Guardian v1 Approval Autopilot bellek tabanlı (globalThis) çalışır; lambda ömrü
-- kadar yaşar. Onay/öneri geçmişini kalıcı tutmak istenirse bu şema elle uygulanır.
--
-- GÜVENLİK NOTU: Bu tablolar yalnızca Guardian'ın ürettiği ÖNERİLERİ ve denetim
-- izini saklar. Müşteri verisi, LP puanı, secret/env, yetki bilgisi İÇERMEZ.
-- Çalıştırmadan önce yedek alın ve staging'de doğrulayın.

BEGIN;

-- Aksiyon önerileri (proposal) — botun ürettiği, onay bekleyen/uygulanan aksiyonlar
CREATE TABLE IF NOT EXISTS guardian_action_proposals (
  id              TEXT PRIMARY KEY,                 -- LBT-ACT-YYYYMMDD-NNN
  incident_id     TEXT,                             -- ilişkili incident (LBT-INC-...)
  title           TEXT NOT NULL,
  description     TEXT,
  risk_level      SMALLINT NOT NULL DEFAULT 2 CHECK (risk_level BETWEEN 0 AND 3),
  status          TEXT NOT NULL DEFAULT 'pending_approval',
  affected_area   TEXT,
  proposed_action TEXT NOT NULL,                    -- allowlist'teki aksiyon adı
  parameters      JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_effect JSONB NOT NULL DEFAULT '[]'::jsonb,
  risks           JSONB NOT NULL DEFAULT '[]'::jsonb,
  rollback        JSONB,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  requires_human    BOOLEAN NOT NULL DEFAULT FALSE,
  occurrences     INTEGER NOT NULL DEFAULT 1,
  created_by      TEXT NOT NULL DEFAULT 'guardian',
  approved_by     TEXT,                             -- maskeli admin id
  approved_at     TIMESTAMPTZ,
  rejected_by     TEXT,
  rejected_at     TIMESTAMPTZ,
  reject_note     TEXT,
  executed_at     TIMESTAMPTZ,
  rolled_back_at  TIMESTAMPTZ,
  result          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guardian_proposals_status
  ON guardian_action_proposals (status, last_seen_at DESC);

-- Uygulama (execution) denetim izi — kim, ne, ne zaman, sonuç
CREATE TABLE IF NOT EXISTS guardian_action_executions (
  id          BIGSERIAL PRIMARY KEY,
  proposal_id TEXT,
  action      TEXT NOT NULL,
  outcome     TEXT NOT NULL,                        -- executed | rejected | blocked | rolled_back | auto_executed | ...
  request_id  TEXT,
  admin_id    TEXT,                                 -- maskeli
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guardian_executions_at
  ON guardian_action_executions (at DESC);

COMMIT;

-- ROLLBACK (gerekirse):
-- DROP TABLE IF EXISTS guardian_action_executions;
-- DROP TABLE IF EXISTS guardian_action_proposals;

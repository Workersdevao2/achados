-- Achados AO – Phase 1 + Claims (Phase 2)
-- Safe to re-run: CREATE IF NOT EXISTS + INSERT OR IGNORE
-- For existing D1: also run the ALTER / claims block below once.

CREATE TABLE IF NOT EXISTS partners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,                    -- esquadra | bombeiros | admin | hospital | uni | centro | other
  address TEXT,
  municipio TEXT,
  provincia TEXT DEFAULT 'Luanda',
  lat REAL,
  lng REAL,
  contact_phone TEXT,
  status TEXT DEFAULT 'active', -- active | pending | suspended
  api_token_hash TEXT,          -- simple hash or plain token for Phase 1 (upgrade later)
  hours_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  public_code TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  description_public TEXT NOT NULL,
  zone TEXT,
  municipio TEXT,
  provincia TEXT DEFAULT 'Luanda',
  found_date_approx TEXT,
  photo_urls_json TEXT DEFAULT '[]',
  status TEXT DEFAULT 'Entrega pendente',  -- Entrega pendente | Recebido no posto | Em validação | Devolvido | Encerrado
  partner_id TEXT,
  finder_contact TEXT,          -- private
  validation_questions_json TEXT DEFAULT '[]',  -- private; array of short strings
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  received_at TEXT,
  FOREIGN KEY (partner_id) REFERENCES partners(id)
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  public_code TEXT NOT NULL,
  claimant_contact TEXT NOT NULL,   -- private
  answers_json TEXT DEFAULT '[]',   -- private; parallel to validation_questions
  status TEXT DEFAULT 'pendente',   -- pendente | em_analise | aceite | rejeitado
  partner_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_partner ON items(partner_id);
CREATE INDEX IF NOT EXISTS idx_items_public_code ON items(public_code);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_claims_item ON claims(item_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_public_code ON claims(public_code);

-- Points ledger (Phase 2): award only on partner confirm_receipt
CREATE TABLE IF NOT EXISTS points_ledger (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL UNIQUE,          -- one award per item (idempotent)
  public_code TEXT,
  finder_contact TEXT NOT NULL,          -- private
  points INTEGER NOT NULL,
  reason TEXT DEFAULT 'confirm_receipt',
  partner_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_points_finder ON points_ledger(finder_contact);
CREATE INDEX IF NOT EXISTS idx_points_created ON points_ledger(created_at);

-- Seed a few demo partners (tokens are simple for Phase 1 – change in production)
INSERT OR IGNORE INTO partners (id, name, type, address, municipio, provincia, api_token_hash, status) VALUES
('p1', 'Esquadra da Polícia – Talatona', 'esquadra', 'Talatona', 'Belas', 'Luanda', 'demo-token-talatona-2026', 'active'),
('p2', 'Bombeiros – Maianga', 'bombeiros', 'Maianga', 'Luanda', 'Luanda', 'demo-token-maianga-2026', 'active'),
('p3', 'Administração Municipal – Viana', 'admin', 'Viana', 'Viana', 'Luanda', 'demo-token-viana-2026', 'active');

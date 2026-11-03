-- WWCB Platform Migration 001
-- Run after schema.sql (adds columns and new tables to existing DB)

-- ── Users: soft-delete and donor profile fields ──────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS donor_ref TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ── Password reset tokens ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS prt_user_idx ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS prt_expires_idx ON password_reset_tokens(expires_at);

-- ── Events ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
  id                 BIGSERIAL PRIMARY KEY,
  title              TEXT NOT NULL,
  description        TEXT,
  category           TEXT,
  start_date         DATE,
  end_date           DATE,
  location           TEXT,
  cover_image_url    TEXT,
  registration_link  TEXT,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  featured           BOOLEAN NOT NULL DEFAULT FALSE,
  created_by         BIGINT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS events_status_idx ON events(status);

-- ── Gallery ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gallery (
  id           BIGSERIAL PRIMARY KEY,
  album_title  TEXT,
  image_url    TEXT NOT NULL,
  caption      TEXT,
  category     TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  published    BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   BIGINT REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gallery_published_idx ON gallery(published, sort_order);

-- ── Donor allocations (explicit / restricted-fund tracking) ──────────────────
CREATE TABLE IF NOT EXISTS donor_allocations (
  id               BIGSERIAL PRIMARY KEY,
  donor_id         BIGINT NOT NULL REFERENCES users(id),
  donation_id      BIGINT REFERENCES donations(id),
  expense_id       BIGINT REFERENCES expenses(id),
  allocated_amount NUMERIC(14,2) NOT NULL CHECK(allocated_amount > 0),
  notes            TEXT,
  period           TEXT NOT NULL,
  created_by       BIGINT REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS da_donor_idx ON donor_allocations(donor_id, period);
CREATE INDEX IF NOT EXISTS da_expense_idx ON donor_allocations(expense_id);

-- ── CSV import history ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS csv_import_history (
  id         BIGSERIAL PRIMARY KEY,
  module     TEXT NOT NULL,
  filename   TEXT NOT NULL,
  admin_id   BIGINT REFERENCES users(id),
  total      INTEGER NOT NULL DEFAULT 0,
  succeeded  INTEGER NOT NULL DEFAULT 0,
  failed     INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'complete' CHECK(status IN ('complete','partial','failed')),
  errors     JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cih_admin_idx ON csv_import_history(admin_id, created_at DESC);

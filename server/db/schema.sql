CREATE TABLE IF NOT EXISTS users (
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','donor')),
 active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS donations (
 id BIGSERIAL PRIMARY KEY, donor_id BIGINT NOT NULL REFERENCES users(id), amount NUMERIC(14,2) NOT NULL CHECK(amount > 0),
 received_on DATE NOT NULL, reference TEXT, notes TEXT, period TEXT NOT NULL,
 created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS expenses (
 id BIGSERIAL PRIMARY KEY, category TEXT NOT NULL, description TEXT NOT NULL, amount NUMERIC(14,2) NOT NULL CHECK(amount > 0),
 spent_on DATE NOT NULL, receipt_url TEXT, period TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('draft','approved','void')),
 created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS site_content (
 key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_by BIGINT REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS feedback (
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT, kind TEXT NOT NULL CHECK(kind IN ('feedback','complaint','volunteer','partnership')),
 message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewing','resolved','archived')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_log (
 id BIGSERIAL PRIMARY KEY, actor_id BIGINT REFERENCES users(id), action TEXT NOT NULL, entity_type TEXT NOT NULL,
 entity_id TEXT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS donations_period_idx ON donations(period);
CREATE INDEX IF NOT EXISTS donations_donor_idx ON donations(donor_id, period);
CREATE INDEX IF NOT EXISTS expenses_period_idx ON expenses(period, status);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at DESC);

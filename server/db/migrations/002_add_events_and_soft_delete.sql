ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'start_date')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'starts_on') THEN
    ALTER TABLE events RENAME COLUMN start_date TO starts_on;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'end_date')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'ends_on') THEN
    ALTER TABLE events RENAME COLUMN end_date TO ends_on;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'registration_link')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'registration_url') THEN
    ALTER TABLE events RENAME COLUMN registration_link TO registration_url;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  short_description TEXT NOT NULL,
  description TEXT NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE,
  location TEXT NOT NULL,
  category TEXT NOT NULL,
  cover_image_url TEXT,
  registration_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  created_by BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(ends_on IS NULL OR ends_on >= starts_on)
);

ALTER TABLE events ADD COLUMN IF NOT EXISTS short_description TEXT;
UPDATE events SET short_description = LEFT(description, 500) WHERE short_description IS NULL;
ALTER TABLE events ALTER COLUMN short_description SET NOT NULL;
CREATE INDEX IF NOT EXISTS events_public_idx ON events(status, starts_on);

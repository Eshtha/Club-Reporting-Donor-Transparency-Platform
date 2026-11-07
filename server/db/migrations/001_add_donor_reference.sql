ALTER TABLE users ADD COLUMN IF NOT EXISTS donor_reference TEXT;

DO $$
DECLARE
  has_legacy_column BOOLEAN;
  has_duplicates BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'donor_ref'
  ) INTO has_legacy_column;

  IF has_legacy_column THEN
    EXECUTE 'SELECT EXISTS (
      SELECT donor_ref
      FROM users
      WHERE donor_ref IS NOT NULL
      GROUP BY donor_ref
      HAVING COUNT(*) > 1
    )' INTO has_duplicates;

    IF has_duplicates THEN
      RAISE EXCEPTION 'Cannot migrate duplicate donor_ref values to donor_reference';
    END IF;

    EXECUTE 'UPDATE users
      SET donor_reference = donor_ref
      WHERE donor_reference IS NULL
        AND donor_ref IS NOT NULL';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_donor_reference_key
  ON users (donor_reference)
  WHERE donor_reference IS NOT NULL;

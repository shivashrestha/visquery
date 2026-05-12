-- Migration: flatten to single images table
-- Run once against the existing database before deploying new backend code.
-- Safe to re-run (all operations use IF EXISTS / IF NOT EXISTS / COALESCE).

BEGIN;

-- ── 1. Add structured metadata columns ──────────────────────────────────────
ALTER TABLE images ADD COLUMN IF NOT EXISTS name              TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS architect         TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS year_built        INTEGER;
ALTER TABLE images ADD COLUMN IF NOT EXISTS location_country  TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS location_city     TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS typology          TEXT[];
ALTER TABLE images ADD COLUMN IF NOT EXISTS materials         TEXT[];
ALTER TABLE images ADD COLUMN IF NOT EXISTS structural_system TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS climate_zone      TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS description       TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS source_url        TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS source_title      TEXT;
ALTER TABLE images ADD COLUMN IF NOT EXISTS source_spider     TEXT;

-- ── 2. Migrate building data into images ─────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'buildings') THEN
    UPDATE images i
    SET
      name             = COALESCE(i.name,             b.name),
      architect        = COALESCE(i.architect,        b.architect),
      year_built       = COALESCE(i.year_built,       b.year_built),
      location_country = COALESCE(i.location_country, b.location_country),
      location_city    = COALESCE(i.location_city,    b.location_city),
      typology         = COALESCE(i.typology,         b.typology),
      materials        = COALESCE(i.materials,        b.materials),
      structural_system= COALESCE(i.structural_system,b.structural_system),
      climate_zone     = COALESCE(i.climate_zone,     b.climate_zone),
      description      = COALESCE(i.description,      b.description)
    FROM buildings b
    WHERE i.building_id = b.id;
  END IF;
END $$;

-- ── 3. Migrate source data into images ───────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sources') THEN
    UPDATE images i
    SET
      source_url   = COALESCE(i.source_url,   s.url),
      source_title = COALESCE(i.source_title, s.title),
      source_spider= COALESCE(i.source_spider,s.spider_name)
    FROM sources s
    WHERE i.source_id = s.id;
  END IF;
END $$;

-- ── 4. Back-fill from metadata_json for images without building records ───────
UPDATE images
SET
  name             = COALESCE(name,             metadata_json->>'name', metadata_json->>'title'),
  architect        = COALESCE(architect,        metadata_json->>'architect'),
  year_built       = COALESCE(year_built,
                       CASE
                         WHEN metadata_json->>'year_built' ~ '^\d{4}$'
                         THEN (metadata_json->>'year_built')::integer
                         ELSE NULL
                       END),
  location_country = COALESCE(location_country, metadata_json->>'location_country'),
  location_city    = COALESCE(location_city,    metadata_json->>'location_city'),
  description      = COALESCE(description,      metadata_json->>'description', caption);

-- ── 5. Drop old FK columns ───────────────────────────────────────────────────
ALTER TABLE images DROP COLUMN IF EXISTS building_id;
ALTER TABLE images DROP COLUMN IF EXISTS source_id;

-- ── 6. Drop old tables ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS feedback  CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;
DROP TABLE IF EXISTS sources   CASCADE;

COMMIT;

-- Visquery database schema
-- Run once on first startup via docker-entrypoint-initdb.d

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- ---------------------------------------------------------------------------
-- sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sources (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    url             TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    publication     TEXT,
    authors         TEXT[],
    publish_date    DATE,
    license         TEXT,                   -- nullable: not always known at scrape time
    text_excerpt    TEXT,
    retrieved_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    spider_name     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sources_spider_name_idx ON sources (spider_name);
CREATE INDEX IF NOT EXISTS sources_license_idx ON sources (license);

-- ---------------------------------------------------------------------------
-- buildings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buildings (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                TEXT NOT NULL,
    architect           TEXT,
    year_built          INTEGER,
    year_range_start    INTEGER,
    year_range_end      INTEGER,
    location_country    TEXT,
    location_city       TEXT,
    latitude            DOUBLE PRECISION,
    longitude           DOUBLE PRECISION,
    typology            TEXT[],
    materials           TEXT[],
    structural_system   TEXT,
    climate_zone        TEXT,
    description         TEXT,
    embedding_version   TEXT NOT NULL DEFAULT 'base',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS buildings_architect_idx ON buildings (architect);
CREATE INDEX IF NOT EXISTS buildings_year_built_idx ON buildings (year_built);
CREATE INDEX IF NOT EXISTS buildings_location_country_idx ON buildings (location_country);
CREATE INDEX IF NOT EXISTS buildings_typology_idx ON buildings USING GIN (typology);
CREATE INDEX IF NOT EXISTS buildings_materials_idx ON buildings USING GIN (materials);
CREATE INDEX IF NOT EXISTS buildings_name_fts_idx ON buildings USING GIN (to_tsvector('english', coalesce(name, '')));
CREATE INDEX IF NOT EXISTS buildings_embedding_version_idx ON buildings (embedding_version);

-- ---------------------------------------------------------------------------
-- images
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS images (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id         UUID REFERENCES buildings(id) ON DELETE SET NULL,
    storage_path        TEXT,               -- nullable until image is downloaded/stored
    url                 TEXT,               -- original source image URL
    sha256              TEXT UNIQUE,        -- nullable if download failed
    phash               TEXT,
    width               INTEGER,
    height              INTEGER,
    caption             TEXT,               -- set by captioner worker post-ingest
    caption_method      TEXT,
    photographer        TEXT,
    license             TEXT NOT NULL,
    license_url         TEXT,
    source_id           UUID REFERENCES sources(id) ON DELETE SET NULL,
    -- Scraper-populated fields
    source_title        TEXT,               -- page title from scraper
    wikidata_id         TEXT,
    near_duplicate_of   TEXT,               -- sha256 of similar image if flagged
    raw_metadata        JSONB,              -- all raw fields from scraper for reference
    embedding_version   TEXT NOT NULL DEFAULT 'base',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS images_building_id_idx ON images (building_id);
CREATE INDEX IF NOT EXISTS images_source_id_idx ON images (source_id);
CREATE INDEX IF NOT EXISTS images_embedding_version_idx ON images (embedding_version);
CREATE INDEX IF NOT EXISTS images_license_idx ON images (license);
CREATE INDEX IF NOT EXISTS images_caption_fts_idx ON images USING GIN (to_tsvector('english', coalesce(caption, '')));

-- ---------------------------------------------------------------------------
-- feedback
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_text          TEXT NOT NULL,
    result_image_id     UUID REFERENCES images(id) ON DELETE SET NULL,
    rating              SMALLINT NOT NULL CHECK (rating IN (-1, 0, 1)),
    reason              TEXT,
    session_id          TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_session_id_idx ON feedback (session_id);
CREATE INDEX IF NOT EXISTS feedback_rating_idx ON feedback (rating);
CREATE INDEX IF NOT EXISTS feedback_result_image_id_idx ON feedback (result_image_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger for buildings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS buildings_updated_at ON buildings;
CREATE TRIGGER buildings_updated_at
    BEFORE UPDATE ON buildings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

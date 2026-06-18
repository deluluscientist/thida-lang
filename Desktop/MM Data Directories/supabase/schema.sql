-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

CREATE TABLE IF NOT EXISTS categories (
  id    BIGSERIAL PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  slug  TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#4a7c59'
);

CREATE TABLE IF NOT EXISTS datasets (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  category_id BIGINT REFERENCES categories(id),
  source      TEXT,
  source_url  TEXT,
  license     TEXT,
  data_types  TEXT,
  tags        TEXT,
  label       TEXT,
  year        TEXT,
  featured    INTEGER DEFAULT 0,
  cover_image TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS articles (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  excerpt     TEXT,
  content     TEXT,
  author      TEXT DEFAULT 'MM Data Directories',
  tag         TEXT,
  label       TEXT,
  cover_image TEXT,
  published   INTEGER DEFAULT 1,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS case_studies (
  id            BIGSERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  tag           TEXT,
  excerpt       TEXT,
  org           TEXT,
  year          TEXT,
  datasets_used TEXT,
  cover_image   TEXT,
  published     INTEGER DEFAULT 1,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guides (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  section     TEXT NOT NULL,
  excerpt     TEXT,
  content     TEXT,
  cover_image TEXT,
  difficulty  TEXT DEFAULT 'Beginner',
  published   INTEGER DEFAULT 1,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Run these if tables already exist (migration):
-- ALTER TABLE guides ADD COLUMN IF NOT EXISTS cover_image TEXT;
-- ALTER TABLE case_studies ADD COLUMN IF NOT EXISTS cover_image TEXT;

CREATE TABLE IF NOT EXISTS submissions (
  id          BIGSERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL,
  source      TEXT,
  category    TEXT,
  description TEXT,
  email       TEXT,
  status      TEXT DEFAULT 'pending',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

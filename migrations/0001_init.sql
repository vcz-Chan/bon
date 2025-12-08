-- pgvector 확장
CREATE EXTENSION IF NOT EXISTS vector;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- kb_category
CREATE TABLE IF NOT EXISTS kb_category (
  id           BIGSERIAL PRIMARY KEY,
  code         VARCHAR(64) NOT NULL UNIQUE,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_kb_category_updated_at
BEFORE UPDATE ON kb_category
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE INDEX IF NOT EXISTS idx_kb_category_active_sort
  ON kb_category (is_active DESC, sort_order ASC, id DESC);

-- kb_article
CREATE TABLE IF NOT EXISTS kb_article (
  id           BIGSERIAL PRIMARY KEY,
  category_id  BIGINT NOT NULL REFERENCES kb_category(id),
  title        VARCHAR(255) NOT NULL,
  content      TEXT NOT NULL,
  summary      TEXT,
  priority     INT NOT NULL DEFAULT 0,
  requires_sm  BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_kb_article_updated_at
BEFORE UPDATE ON kb_article
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE INDEX IF NOT EXISTS idx_kb_article_category ON kb_article (category_id);
CREATE INDEX IF NOT EXISTS idx_kb_article_published ON kb_article (is_published);
CREATE INDEX IF NOT EXISTS idx_kb_article_priority ON kb_article (priority DESC, id DESC);

-- kb_chunk
-- EMBEDDING_DIM 자리 표시는 run-migrations.js에서 환경변수로 치환된다.
-- 기본값 1536
CREATE TABLE IF NOT EXISTS kb_chunk (
  id            BIGSERIAL PRIMARY KEY,
  article_id    BIGINT NOT NULL REFERENCES kb_article(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  embedding     vector({{EMBEDDING_DIM}}) NOT NULL,
  chunk_index   INT NOT NULL,
  category_code VARCHAR(64) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kb_chunk_article ON kb_chunk (article_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunk_category ON kb_chunk (category_code);
-- 유사도 검색 인덱스 (충분한 데이터 적재 후 생성 권장)
-- CREATE INDEX idx_kb_chunk_embedding ON kb_chunk USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 초기 카테고리 시드
INSERT INTO kb_category (code, name, sort_order)
VALUES
  ('NEED_SM', 'SM 문의 필요 항목', 1),
  ('STORAGE', '메뉴 보관 방법', 2),
  ('TAKEOUT', '포장 규정', 3),
  ('SALINITY', '염도 조절 규정', 4),
  ('ORDER_TIPS', '발주 팁', 5),
  ('CUSTOM_REQUEST', '추가 문의/요청 처리', 6)
ON CONFLICT (code) DO NOTHING;

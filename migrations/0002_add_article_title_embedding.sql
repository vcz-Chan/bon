-- Add title embedding column to kb_article
-- EMBEDDING_DIM placeholder will be replaced by run-migrations.js

ALTER TABLE kb_article
ADD COLUMN IF NOT EXISTS title_embedding vector({{EMBEDDING_DIM}});

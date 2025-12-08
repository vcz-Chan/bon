export type RagChunk = {
  chunk_id: number;
  article_id: number;
  category_code: string;
  title?: string;
  requires_sm: boolean;
  content: string;
  score?: number;
};

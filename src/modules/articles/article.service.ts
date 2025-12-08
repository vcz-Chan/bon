import { pool } from '../../config/db';
import { EmbeddingsProvider } from '../../infra/llm/embeddings.provider';
import { splitContentIntoChunks } from './chunker';
import { ArticleRepository } from './article.repository';
import { CategoryRepository } from '../categories/category.repository';
import { toPgVector, toPgVectorMany } from '../../utils/pgvector';

const embeddingsProvider = new EmbeddingsProvider();

type UpsertPayload = {
  category_id: number;
  title: string;
  content: string;
  summary?: string;
  priority?: number;
  requires_sm?: boolean;
  is_published?: boolean;
};

export class ArticleService {
  constructor(
    private articleRepo = new ArticleRepository(),
    private categoryRepo = new CategoryRepository()
  ) {}

  list(params: { category_id?: number; is_published?: boolean; page?: number; page_size?: number }) {
    return this.articleRepo.list(params);
  }

  async get(id: number) {
    return this.articleRepo.getById(id);
  }

  async create(payload: UpsertPayload) {
    const chunks = splitContentIntoChunks(payload.content);
    const embeddings = await embeddingsProvider.embedMany(chunks);
    const vectors = toPgVectorMany(embeddings);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const category = await this.categoryRepo.getById(payload.category_id, client);
      if (!category) {
        throw new Error('category not found');
      }

      const articleId = await this.articleRepo.insert(
        {
          category_id: payload.category_id,
          title: payload.title,
          content: payload.content,
          summary: payload.summary ?? null,
          priority: payload.priority ?? 0,
          requires_sm: payload.requires_sm ?? false,
          is_published: payload.is_published ?? true
        },
        client
      );

      await this.replaceChunks({
        client,
        articleId,
        categoryCode: category.code,
        chunks,
        embeddings: vectors
      });

      await client.query('COMMIT');
      return { id: articleId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async update(id: number, payload: UpsertPayload) {
    const chunks = splitContentIntoChunks(payload.content);
    const embeddings = await embeddingsProvider.embedMany(chunks);
    const vectors = toPgVectorMany(embeddings);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const category = await this.categoryRepo.getById(payload.category_id, client);
      if (!category) {
        throw new Error('category not found');
      }
      const existing = await this.articleRepo.getById(id, client);
      if (!existing) {
        throw new Error('article not found');
      }

      await this.articleRepo.update(
        id,
        {
          category_id: payload.category_id,
          title: payload.title,
          content: payload.content,
          summary: payload.summary ?? null,
          priority: payload.priority ?? 0,
          requires_sm: payload.requires_sm ?? false,
          is_published: payload.is_published ?? true
        },
        client
      );

      await client.query('DELETE FROM kb_chunk WHERE article_id = $1', [id]);
      await this.replaceChunks({
        client,
        articleId: id,
        categoryCode: category.code,
        chunks,
        embeddings: vectors
      });

      await client.query('COMMIT');
      return { id };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async delete(id: number) {
    await this.articleRepo.delete(id);
  }

  private async replaceChunks(params: {
    client: import('pg').PoolClient;
    articleId: number;
    categoryCode: string;
    chunks: string[];
    embeddings: string[];
  }) {
    const { client, articleId, categoryCode, chunks, embeddings } = params;
    const values: any[] = [];
    const valueStrings: string[] = [];

    chunks.forEach((content, idx) => {
      const embedding = embeddings[idx];
      const baseIndex = valueStrings.length * 5;
      values.push(articleId, content, embedding, idx, categoryCode);
      valueStrings.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}::vector, $${baseIndex + 4}, $${baseIndex + 5})`
      );
    });

    if (values.length === 0) return;

    await client.query(
      `INSERT INTO kb_chunk (article_id, content, embedding, chunk_index, category_code)
       VALUES ${valueStrings.join(', ')}`,
      values
    );
  }
}

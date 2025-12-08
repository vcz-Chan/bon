import { PoolClient } from 'pg';
import { pool } from '../../config/db';

export type Article = {
  id: number;
  category_id: number;
  title: string;
  content: string;
  summary: string | null;
  priority: number;
  requires_sm: boolean;
  is_published: boolean;
  title_embedding?: string | null;
  created_at?: string;
  updated_at?: string;
};

export class ArticleRepository {
  async list(params: {
    category_id?: number;
    is_published?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<{ data: Article[]; total: number }> {
    const { category_id, is_published, page = 1, page_size = 20 } = params;
    const filters: string[] = [];
    const values: any[] = [];

    if (category_id) {
      values.push(category_id);
      filters.push(`category_id = $${values.length}`);
    }
    if (typeof is_published === 'boolean') {
      values.push(is_published);
      filters.push(`is_published = $${values.length}`);
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(page_size, 100));
    const offset = (Math.max(1, page) - 1) * limit;
    values.push(limit, offset);

    const dataQuery = `
      SELECT id, category_id, title, content, summary, priority, requires_sm, is_published, title_embedding
      FROM kb_article
      ${where}
      ORDER BY id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;
    const { rows } = await pool.query<Article>(dataQuery, values);

    const countQuery = `SELECT COUNT(*)::int AS total FROM kb_article ${where}`;
    const { rows: countRows } = await pool.query<{ total: number }>(countQuery, values.slice(0, values.length - 2));

    return { data: rows, total: countRows[0]?.total ?? 0 };
  }

  async getById(id: number, client?: PoolClient): Promise<Article | null> {
    const executor = client || pool;
    const { rows } = await executor.query<Article>(
      `SELECT id, category_id, title, content, summary, priority, requires_sm, is_published
       FROM kb_article WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }

  async insert(article: Omit<Article, 'id'>, client: PoolClient): Promise<number> {
    const {
      category_id,
      title,
      content,
      summary,
      priority,
      requires_sm,
      is_published,
      title_embedding
    } = article;
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO kb_article (category_id, title, content, summary, priority, requires_sm, is_published, title_embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [category_id, title, content, summary ?? null, priority, requires_sm, is_published, title_embedding]
    );
    return rows[0].id;
  }

  async update(id: number, article: Partial<Article>, client: PoolClient): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(article)) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
    if (fields.length === 0) return;
    values.push(id);
    await client.query(`UPDATE kb_article SET ${fields.join(', ')} WHERE id = $${idx}`, values);
  }

  async delete(id: number): Promise<void> {
    await pool.query('DELETE FROM kb_article WHERE id = $1', [id]);
  }
}

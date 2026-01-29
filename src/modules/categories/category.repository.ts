import { PoolClient } from 'pg';
import { pool } from '../../config/db';

export type Category = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  deleted_at?: string | null;
  article_count?: number;
};

export class CategoryRepository {
  async list(): Promise<Category[]> {
    const { rows } = await pool.query<Category>(
      'SELECT id, code, name, description, sort_order, is_active FROM kb_category WHERE deleted_at IS NULL ORDER BY sort_order ASC, id DESC'
    );
    return rows;
  }

  async listWithArticleCount(): Promise<Category[]> {
    const { rows } = await pool.query<Category>(
      `
      SELECT
        c.id,
        c.code,
        c.name,
        c.description,
        c.sort_order,
        c.is_active,
        COALESCE(COUNT(a.id), 0) AS article_count
      FROM kb_category c
      LEFT JOIN kb_article a
        ON a.category_id = c.id
        AND a.is_published = true
        AND a.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
      GROUP BY c.id, c.code, c.name, c.description, c.sort_order, c.is_active
      ORDER BY c.sort_order ASC, c.id DESC
      `
    );
    return rows;
  }

  async getById(id: number, client?: PoolClient): Promise<Category | null> {
    const executor = client || pool;
    const { rows } = await executor.query<Category>(
      'SELECT id, code, name, description, sort_order, is_active FROM kb_category WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return rows[0] || null;
  }

  async create(data: {
    code: string;
    name: string;
    description?: string;
    sort_order?: number;
    is_active?: boolean;
  }) {
    const { code, name, description, sort_order = 0, is_active = true } = data;
    const { rows } = await pool.query<Category>(
      `INSERT INTO kb_category (code, name, description, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, code, name, description, sort_order, is_active`,
      [code, name, description ?? null, sort_order, is_active]
    );
    return rows[0];
  }

  async update(id: number, data: Partial<Omit<Category, 'id'>>): Promise<Category | null> {
    const fields = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(data)) {
      fields.push(`${key} = $${idx++}`);
      values.push(value);
    }
    if (fields.length === 0) return this.getById(id);
    values.push(id);

    const { rows } = await pool.query<Category>(
      `UPDATE kb_category SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING id, code, name, description, sort_order, is_active`,
      values
    );
    return rows[0] || null;
  }

  async softDelete(id: number, client?: PoolClient) {
    const executor = client || pool;
    await executor.query('UPDATE kb_category SET deleted_at = now(), is_active = false WHERE id = $1 AND deleted_at IS NULL', [
      id
    ]);
  }
}

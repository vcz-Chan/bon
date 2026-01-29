import { pool } from '../../config/db';
import { ArticleRepository } from '../articles/article.repository';
import { CategoryRepository } from './category.repository';

export class CategoryService {
  constructor(
    private repo = new CategoryRepository(),
    private articleRepo = new ArticleRepository()
  ) {}

  list() {
    return this.repo.list();
  }

  listWithCounts() {
    return this.repo.listWithArticleCount();
  }

  create(data: { code: string; name: string; description?: string; sort_order?: number }) {
    return this.repo.create(data);
  }

  update(id: number, data: { name?: string; description?: string; sort_order?: number; is_active?: boolean }) {
    return this.repo.update(id, data);
  }

  async delete(id: number) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await this.repo.softDelete(id, client);
      await this.articleRepo.softDeleteByCategoryId(id, client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

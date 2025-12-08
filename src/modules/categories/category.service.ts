import { CategoryRepository } from './category.repository';

export class CategoryService {
  constructor(private repo = new CategoryRepository()) {}

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

  delete(id: number) {
    return this.repo.delete(id);
  }
}

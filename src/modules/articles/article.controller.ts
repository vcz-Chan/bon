import { Router } from 'express';
import { requireRole } from '../../middleware/auth.middleware';
import { ArticleService } from './article.service';

const router = Router();
const service = new ArticleService();

router.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { category_id, is_published, page, page_size } = req.query;
    const parsed = {
      category_id: category_id ? Number(category_id) : undefined,
      is_published:
        typeof is_published === 'string'
          ? is_published === 'true'
          : typeof is_published === 'boolean'
          ? is_published
          : undefined,
      page: page ? Number(page) : undefined,
      page_size: page_size ? Number(page_size) : undefined
    };
    const data = await service.list(parsed);
    res.json({ ok: true, ...data });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, message: 'invalid id' });
    const article = await service.get(id);
    if (!article) return res.status(404).json({ ok: false, message: 'not found' });
    res.json({ ok: true, data: article });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { category_id, title, content } = req.body;
    if (!category_id || !title || !content) {
      return res.status(400).json({ ok: false, message: 'category_id, title, content are required' });
    }
    const result = await service.create(req.body);
    res.json({ ok: true, data: result });
  } catch (err: any) {
    if (err?.message === 'category not found') {
      return res.status(400).json({ ok: false, message: 'category not found' });
    }
    next(err);
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { category_id, title, content } = req.body;
    if (!id || !category_id || !title || !content) {
      return res
        .status(400)
        .json({ ok: false, message: 'id, category_id, title, content are required' });
    }
    await service.update(id, req.body);
    res.json({ ok: true, data: { id } });
  } catch (err: any) {
    if (err?.message === 'category not found') {
      return res.status(400).json({ ok: false, message: 'category not found' });
    }
    if (err?.message === 'article not found') {
      return res.status(404).json({ ok: false, message: 'article not found' });
    }
    next(err);
  }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, message: 'invalid id' });
    await service.delete(id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;

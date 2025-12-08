import { Router } from 'express';
import { CategoryService } from './category.service';
import { requireRole } from '../../middleware/auth.middleware';

const router = Router();
const service = new CategoryService();

router.get('/', requireRole('admin'), async (_req, res, next) => {
  try {
    const data = await service.listWithCounts();
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const { code, name, description, sort_order } = req.body;
    if (!code || !name) return res.status(400).json({ ok: false, message: 'code and name are required' });
    const created = await service.create({ code, name, description, sort_order });
    res.json({ ok: true, data: created });
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, message: 'invalid id' });
    const updated = await service.update(id, req.body);
    if (!updated) return res.status(404).json({ ok: false, message: 'not found' });
    res.json({ ok: true, data: updated });
  } catch (err) {
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

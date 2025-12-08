import { Router } from 'express';
import { requireRole } from '../../middleware/auth.middleware';
import { ChatService } from './chat.service';

const router = Router();
const chatService = new ChatService();

router.post('/preview-chat', requireRole('admin'), async (req, res, next) => {
  const { question } = req.body as { question?: string };
  if (!question || !question.trim()) {
    return res.status(400).json({ ok: false, message: 'question은 필수입니다.' });
  }
  try {
    const result = await chatService.getAnswer(question, { includeChunks: true });
    return res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

export default router;

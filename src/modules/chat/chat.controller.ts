import { Router, Request, Response } from 'express';
import { ChatService } from './chat.service';
import { requireRole } from '../../middleware/auth.middleware';

const router = Router();
const chatService = new ChatService();

router.post('/chat', requireRole('user'), async (req: Request, res: Response) => {
  const { question } = req.body as { question?: string };
  if (!question || !question.trim()) {
    return res.status(400).json({ ok: false, message: 'question is required' });
  }
  try {
    const result = await chatService.getAnswer(question);
    return res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500);
    throw err;
  }
});

router.post('/chat/stream', requireRole('user'), async (req: Request, res: Response) => {
  const { question } = req.body as { question?: string };
  if (!question || !question.trim()) {
    return res.status(400).json({ ok: false, message: 'question is required' });
  }

  try {
    const { stream, fallbackToSm, references } = await chatService.streamAnswer(question);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const send = (event: string, data: any) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send('meta', { fallback_to_sm: fallbackToSm, references });

    for await (const chunk of stream) {
      send('chunk', { text: chunk });
    }

    send('end', {});
    res.end();
  } catch (err) {
    // 최소 로깅: 스트림 에러를 서버 로그에 남김
    // eslint-disable-next-line no-console
    console.error('[chat/stream error]', err);
    res.status(500);
    res.write('event: error\n');
    res.write(`data: {"message":"internal error"}\n\n`);
    res.end();
  }
});

export default router;

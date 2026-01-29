import { Router, Request, Response } from 'express';
import { ChatService } from './chat.service';
import { requireRole } from '../../middleware/auth.middleware';

const router = Router();
const chatService = new ChatService();

router.post('/chat', requireRole('user'), async (req: Request, res: Response) => {
  const { question } = req.body as { question?: string };
  if (!question || !question.trim()) {
    return res.status(400).json({ ok: false, message: 'question은 필수입니다.' });
  }
  try {
    const result = await chatService.getAnswer(question);
    if (result.usage) {
      // eslint-disable-next-line no-console
      console.log('[llm][usage][chat-response]', result.usage, result.cost ? { cost_usd: result.cost } : '');
    }
    return res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500);
    throw err;
  }
});

router.post('/chat/stream', requireRole('user'), async (req: Request, res: Response) => {
  const { question } = req.body as { question?: string };
  if (!question || !question.trim()) {
    return res.status(400).json({ ok: false, message: 'question은 필수입니다.' });
  }

  try {
    const { stream, usageRef, fallbackToSm, references } = await chatService.streamAnswer(question);

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

    if (usageRef.value) {
      send('usage', { usage: usageRef.value, cost: usageRef.cost });
      // eslint-disable-next-line no-console
      console.log('[llm][usage][chat-stream]', usageRef.value, usageRef.cost ? { cost_usd: usageRef.cost } : '');
    }

    // end 이벤트에도 usage/cost를 포함해 클라이언트가 한 번에 받을 수 있게 함
    send('end', usageRef.value ? { usage: usageRef.value, cost: usageRef.cost } : {});
    res.end();
  } catch (err) {
    // 최소 로깅: 스트림 에러를 서버 로그에 남김
    // eslint-disable-next-line no-console
    console.error('[chat/stream error]', err);
    res.status(500);
    res.write('event: error\n');
    res.write(`data: {"message":"내부 오류가 발생했습니다."}\n\n`);
    res.end();
  }
});

export default router;

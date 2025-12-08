import express from 'express';
import { errorHandler } from './middleware/error.middleware';
import authRouter from './modules/auth/auth.controller';
import chatRouter from './modules/chat/chat.controller';
import categoryRouter from './modules/categories/category.controller';
import articleRouter from './modules/articles/article.controller';
import previewRouter from './modules/chat/chat.preview.controller';

const app = express();

app.use(express.json());

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// 라우터 등록
app.use('/api/auth', authRouter);
app.use('/api/user', chatRouter);
app.use('/api/admin/categories', categoryRouter);
app.use('/api/admin/articles', articleRouter);
app.use('/api/admin', previewRouter);

// 에러 핸들러는 마지막에 등록
app.use(errorHandler);

export default app;

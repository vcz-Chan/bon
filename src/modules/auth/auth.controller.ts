import { Router } from 'express';
import { env } from '../../config/env';

const router = Router();

router.post('/verify', (req, res) => {
  const { mode, password } = req.body as { mode?: 'admin' | 'user'; password?: string };
  if (!mode || !password) {
    return res.status(400).json({ ok: false, message: 'mode와 password는 필수입니다.' });
  }
  if (mode === 'admin') {
    if (!env.adminPassword) return res.status(500).json({ ok: false, message: 'ADMIN_PASSWORD가 설정되지 않았습니다.' });
    if (password === env.adminPassword) return res.json({ ok: true, role: 'admin' });
  }
  if (mode === 'user') {
    if (!env.userPassword) return res.status(500).json({ ok: false, message: 'USER_PASSWORD가 설정되지 않았습니다.' });
    if (password === env.userPassword) return res.json({ ok: true, role: 'user' });
  }
  return res.status(401).json({ ok: false, message: '비밀번호가 올바르지 않습니다.' });
});

export default router;

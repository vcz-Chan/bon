import { Router } from 'express';
import { env } from '../../config/env';

const router = Router();

router.post('/verify', (req, res) => {
  const { mode, password } = req.body as { mode?: 'admin' | 'user'; password?: string };
  if (!mode || !password) {
    return res.status(400).json({ ok: false, message: 'mode and password are required' });
  }
  if (mode === 'admin') {
    if (!env.adminPassword) return res.status(500).json({ ok: false, message: 'ADMIN_PASSWORD not set' });
    if (password === env.adminPassword) return res.json({ ok: true, role: 'admin' });
  }
  if (mode === 'user') {
    if (!env.userPassword) return res.status(500).json({ ok: false, message: 'USER_PASSWORD not set' });
    if (password === env.userPassword) return res.json({ ok: true, role: 'user' });
  }
  return res.status(401).json({ ok: false, message: 'invalid password' });
});

export default router;

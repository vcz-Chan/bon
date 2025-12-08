import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

export type Role = 'admin' | 'user';

const headerMap: Record<Role, string> = {
  admin: 'x-admin-password',
  user: 'x-user-password'
};

const secretMap: Record<Role, string | undefined> = {
  admin: env.adminPassword,
  user: env.userPassword
};

export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    const headerName = headerMap[role];
    const expected = secretMap[role];
  const provided = req.header(headerName);

  if (!expected) {
    return res.status(500).json({ ok: false, message: '역할 비밀번호가 설정되지 않았습니다.' });
  }
  if (!provided || provided !== expected) {
    return res.status(401).json({ ok: false, message: '비밀번호가 올바르지 않습니다.' });
  }
  return next();
};
}

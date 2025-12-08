import { NextFunction, Request, Response } from 'express';

const SENSITIVE_HEADERS = new Set(['x-admin-password', 'x-user-password', 'authorization']);

const maskHeaders = (headers: Request['headers']) => {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (SENSITIVE_HEADERS.has(key.toLowerCase())) {
      masked[key] = '[masked]';
    } else {
      masked[key] = Array.isArray(value) ? value.join(',') : String(value);
    }
  }
  return masked;
};

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const status = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  // 최소 로깅 (민감 헤더 마스킹)
  // eslint-disable-next-line no-console
  console.error(
    `[ERROR] ${req.method} ${req.originalUrl} -> ${status}`,
    err.message,
    { headers: maskHeaders(req.headers) }
  );

  res.status(status).json({
    ok: false,
    message: err.message || '내부 서버 오류'
  });
}

import { Request, Response, NextFunction } from 'express';

const SENSITIVE_FIELDS = new Set([
  'authorization',
  'x-step-up',
  'refreshtoken',
  'token',
  'code',
  'password',
  'secret',
  'phone',
  'email',
]);

function scrubValue(key: string, val: any): any {
  if (val == null) return val;
  const lKey = key.toLowerCase();
  if (SENSITIVE_FIELDS.has(lKey)) {
    return '[REDACTED]';
  }
  if (typeof val === 'object' && !Array.isArray(val)) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      res[k] = scrubValue(k, v);
    }
    return res;
  }
  return val;
}

export function jsonLoggerMiddleware(req: Request, res: Response, next: NextFunction) {
  // Ignorer les requêtes fréquentes de health check pour ne pas polluer les logs
  if (req.path === '/health' || req.path === '/ready') {
    return next();
  }

  const start = Date.now();
  const reqId = req.headers['x-request-id'] || `req_${Math.random().toString(36).slice(2, 10)}`;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO',
      requestId: reqId,
      method: req.method,
      path: req.baseUrl + req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ? String(req.headers['user-agent']).slice(0, 80) : undefined,
    };

    console.log(JSON.stringify(logEntry));
  });

  next();
}

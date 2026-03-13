import { Request, Response, NextFunction } from 'express';

export function timingMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    (req as any).__zlar_start = process.hrtime.bigint();
    next();
  };
}

export function getElapsedMs(req: Request): number {
  const start = (req as any).__zlar_start as bigint;
  if (!start) return 0;
  const elapsed = process.hrtime.bigint() - start;
  return Number(elapsed) / 1_000_000;
}

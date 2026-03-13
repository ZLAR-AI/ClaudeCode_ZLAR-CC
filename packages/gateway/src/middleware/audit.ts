import { Request, Response, NextFunction } from 'express';
import { AuditEntry } from '@zlar/shared';

export function createAuditMiddleware(
  auditLogger: { log: (entry: AuditEntry) => void }
) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.on('finish', () => {
      const entry = (res as any).__zlar_audit_entry as AuditEntry | undefined;
      if (entry) {
        auditLogger.log(entry);
      }
    });
    next();
  };
}

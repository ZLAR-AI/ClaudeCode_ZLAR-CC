import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuditEntry } from './types';

export function createAuditLogger(logPath: string) {
  const dir = path.dirname(logPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const stream = fs.createWriteStream(logPath, { flags: 'a' });

  return {
    log(entry: AuditEntry) {
      stream.write(JSON.stringify(entry) + '\n');
    },
    close() {
      stream.end();
    }
  };
}

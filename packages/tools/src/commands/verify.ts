import * as fs from 'node:fs';
import * as path from 'node:path';
import { verifySignature, fromHex } from '@zlar/shared';

export async function verify(args: string[]): Promise<void> {
  if (args.length < 3) {
    console.log('Usage: verify <policy.yaml> <policy.yaml.sig> <public-key-file>');
    process.exit(1);
  }

  const policyPath = path.resolve(args[0]);
  const sigPath = path.resolve(args[1]);
  const pubKeyPath = path.resolve(args[2]);

  const policyBytes = fs.readFileSync(policyPath);
  const sigHex = fs.readFileSync(sigPath, 'utf8').trim();
  const pubKeyHex = fs.readFileSync(pubKeyPath, 'utf8').trim();

  console.log(`Verifying policy: ${policyPath}`);
  const isValid = verifySignature(
    fromHex(sigHex),
    new Uint8Array(policyBytes),
    fromHex(pubKeyHex)
  );

  if (isValid) {
    console.log('VALID — Policy signature is authentic.');
  } else {
    console.error('INVALID — Policy signature verification FAILED.');
    process.exit(1);
  }
}

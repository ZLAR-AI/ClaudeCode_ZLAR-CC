import * as fs from 'node:fs';
import * as path from 'node:path';
import { signMessage, fromHex, toHex } from '@zlar/shared';

export async function sign(args: string[]): Promise<void> {
  if (args.length < 2) {
    console.log('Usage: sign <policy.yaml> <private-key-file>');
    process.exit(1);
  }

  const policyPath = path.resolve(args[0]);
  const keyPath = path.resolve(args[1]);

  const policyBytes = fs.readFileSync(policyPath);
  const privateKeyHex = fs.readFileSync(keyPath, 'utf8').trim();
  const privateKey = fromHex(privateKeyHex);

  console.log(`Signing policy: ${policyPath}`);
  const signature = signMessage(new Uint8Array(policyBytes), privateKey);
  const sigHex = toHex(signature);

  const sigPath = policyPath + '.sig';
  fs.writeFileSync(sigPath, sigHex + '\n');

  console.log(`Signature: ${sigPath}`);
  console.log(`Signature (hex): ${sigHex.slice(0, 32)}...`);
}

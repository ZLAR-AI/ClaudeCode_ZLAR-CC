import * as fs from 'node:fs';
import * as path from 'node:path';
import { generateKeyPair, toHex } from '@zlar/shared';

export async function keygen(args: string[]): Promise<void> {
  const outputDir = args[0] || path.resolve(__dirname, '../../../../config/keys');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Generating Ed25519 keypair...');
  const { privateKey, publicKey } = generateKeyPair();

  const privPath = path.join(outputDir, 'zlar-private.key');
  const pubPath = path.join(outputDir, 'zlar-public.key');

  fs.writeFileSync(privPath, toHex(privateKey) + '\n');
  fs.writeFileSync(pubPath, toHex(publicKey) + '\n');
  fs.chmodSync(privPath, 0o600);

  console.log(`Private key: ${privPath}`);
  console.log(`Public key:  ${pubPath}`);
  console.log(`\nPublic key (hex): ${toHex(publicKey)}`);
  console.log('\nKeep the private key secure. Never commit it to version control.');
}

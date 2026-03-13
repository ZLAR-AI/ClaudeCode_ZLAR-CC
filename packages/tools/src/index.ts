import { keygen } from './commands/keygen';
import { sign } from './commands/sign';
import { verify } from './commands/verify';

const command = process.argv[2];

async function main() {
  switch (command) {
    case 'keygen':
      await keygen(process.argv.slice(3));
      break;
    case 'sign':
      await sign(process.argv.slice(3));
      break;
    case 'verify':
      await verify(process.argv.slice(3));
      break;
    default:
      console.log('ZLAR CLI Tool');
      console.log('');
      console.log('Usage:');
      console.log('  keygen [output-dir]                    Generate Ed25519 keypair');
      console.log('  sign <policy> <private-key>            Sign a YAML policy file');
      console.log('  verify <policy> <sig> <public-key>     Verify a signed policy');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});

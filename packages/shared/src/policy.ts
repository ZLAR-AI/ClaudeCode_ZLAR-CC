import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import { PolicyConfig } from './types';
import { verifySignature, fromHex } from './crypto';

export function loadPolicyFromFile(filePath: string): PolicyConfig {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.load(raw) as PolicyConfig;
  validatePolicy(parsed);
  return parsed;
}

export function loadAndVerifyPolicy(
  policyPath: string,
  signaturePath: string,
  publicKeyHex: string
): PolicyConfig {
  const policyBytes = fs.readFileSync(policyPath);
  const sigHex = fs.readFileSync(signaturePath, 'utf8').trim();

  const isValid = verifySignature(
    fromHex(sigHex),
    new Uint8Array(policyBytes),
    fromHex(publicKeyHex)
  );

  if (!isValid) {
    throw new Error('Policy signature verification failed. Policy may have been tampered with.');
  }

  const parsed = yaml.load(policyBytes.toString('utf8')) as PolicyConfig;
  validatePolicy(parsed);
  return parsed;
}

function validatePolicy(policy: PolicyConfig): void {
  if (!policy.version) throw new Error('Policy missing version');
  if (!policy.target?.baseUrl) throw new Error('Policy missing target.baseUrl');
  if (!Array.isArray(policy.rules)) throw new Error('Policy missing rules array');
  for (const rule of policy.rules) {
    if (!rule.id || !rule.match || !rule.action) {
      throw new Error(`Invalid rule: ${JSON.stringify(rule)}`);
    }
  }
}

import { runScenarios } from './scenarios';
import { printReport } from './reporter';

async function main() {
  const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3000';
  const agentId = process.env.AGENT_ID || 'demo-agent-001';

  console.log('=== ZLAR Demo Agent ===');
  console.log(`Gateway: ${gatewayUrl}`);
  console.log(`Agent ID: ${agentId}`);

  const results = await runScenarios(gatewayUrl, agentId);
  printReport(results);
}

main().catch(console.error);

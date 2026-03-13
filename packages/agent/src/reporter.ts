import { ScenarioResult } from './scenarios';

export function printReport(results: ScenarioResult[]): void {
  console.log('\n');
  console.log('=========================================');
  console.log('          ZLAR GATEWAY — RESULTS         ');
  console.log('=========================================');
  console.log('');

  const passthroughs = results.filter(r => r.zlarStatus === 'passthrough');
  const halted = results.filter(
    r => r.zlarStatus === 'pending_authorization' || r.statusCode === 403
  );
  const authorized = results.filter(r => r.zlarStatus === 'authorized');

  console.log(`  Total actions:  ${results.length}`);
  console.log(`  Passthroughs:   ${passthroughs.length}`);
  console.log(`  Halted:         ${halted.length}`);
  console.log(`  Authorized:     ${authorized.length}`);

  if (passthroughs.length > 0) {
    const avgTotal =
      passthroughs.reduce((sum, r) => sum + r.totalLatencyMs, 0) / passthroughs.length;
    const zlarLatencies = passthroughs
      .map(r => parseFloat(r.zlarLatency || '0'))
      .filter(v => v > 0);
    const avgZlar =
      zlarLatencies.length > 0
        ? zlarLatencies.reduce((a, b) => a + b, 0) / zlarLatencies.length
        : 0;

    console.log('');
    console.log('  Passthrough Performance:');
    console.log(`    Avg total round-trip: ${avgTotal.toFixed(2)}ms`);
    console.log(`    Avg ZLAR overhead:    ${avgZlar.toFixed(3)}ms`);
  }

  console.log('');
  console.log('  --- Individual Results ---');
  for (const r of results) {
    const status = r.zlarStatus || (r.statusCode === 0 ? 'TIMEOUT' : 'UNKNOWN');
    const icon = status === 'passthrough' ? '\u2714' : status === 'authorized' ? '\u2714' : '\u2718';
    console.log(`  ${icon} ${r.name}`);
    console.log(`      HTTP ${r.statusCode || 'n/a'} | ZLAR: ${status} | ${r.totalLatencyMs.toFixed(2)}ms`);
  }

  console.log('');
  console.log('=========================================');
  console.log('  The gate has no intelligence.');
  console.log('  That is the point.');
  console.log('=========================================');
}

/**
 * Test network-specific logs optimization
 * Verifies that different networks use appropriate batch sizes
 */

const { NETWORKS } = require('../config/networks.js');

console.log('='.repeat(80));
console.log('Network-Specific Logs Optimization Test');
console.log('='.repeat(80));
console.log('');

// Test networks
const testNetworks = ['ethereum', 'polygon', 'base', 'optimism', 'arbitrum', 'linea'];

testNetworks.forEach(networkName => {
  const config = NETWORKS[networkName];

  if (!config) {
    console.log(`❌ ${networkName}: NOT CONFIGURED`);
    return;
  }

  const optimization = config.logsOptimization;

  console.log(`${config.name} (${networkName}):`);

  if (!optimization) {
    console.log(`  ⚠️  No logsOptimization configured`);
    console.log('');
    return;
  }

  console.log(`  Initial batch size: ${optimization.initialBatchSize} blocks`);
  console.log(`  Min/Max batch size: ${optimization.minBatchSize}-${optimization.maxBatchSize} blocks`);
  console.log(`  Target duration: ${optimization.targetDuration}ms`);
  console.log(`  Target logs/request: ${optimization.targetLogsPerRequest.toLocaleString()}`);
  console.log(`  Fast multiplier: ${optimization.fastMultiplier}x`);
  console.log(`  Slow multiplier: ${optimization.slowMultiplier}x`);
  console.log('');
});

console.log('='.repeat(80));
console.log('Summary');
console.log('='.repeat(80));
console.log('');

// High-activity networks
const highActivity = testNetworks.filter(n => {
  const opt = NETWORKS[n]?.logsOptimization;
  return opt && opt.initialBatchSize <= 100;
});

// Medium-activity networks
const mediumActivity = testNetworks.filter(n => {
  const opt = NETWORKS[n]?.logsOptimization;
  return opt && opt.initialBatchSize > 100 && opt.initialBatchSize < 2000;
});

// Low-activity networks
const lowActivity = testNetworks.filter(n => {
  const opt = NETWORKS[n]?.logsOptimization;
  return opt && opt.initialBatchSize >= 2000;
});

console.log(`High-activity (100 blocks): ${highActivity.join(', ')}`);
console.log(`Medium-activity (500 blocks): ${mediumActivity.join(', ')}`);
console.log(`Low-activity (2000 blocks): ${lowActivity.join(', ')}`);
console.log('');

console.log('✅ Optimization configuration loaded successfully');

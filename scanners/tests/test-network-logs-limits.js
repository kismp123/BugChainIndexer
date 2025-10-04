/**
 * Test to verify logs limits across different networks
 * Tests BSC, Polygon, Arbitrum, Optimism, Base, Avalanche
 */

const { AlchemyRPCClient } = require('../common/alchemyRpc');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// Disable proxy for this test
process.env.USE_ALCHEMY_PROXY = 'false';

const TRANSFER_EVENT = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Networks to test
const NETWORKS = [
  { name: 'binance', displayName: 'BSC (Binance Smart Chain)', expectedLimit: 50000 },
  { name: 'polygon', displayName: 'Polygon', expectedLimit: null },
  { name: 'arbitrum', displayName: 'Arbitrum', expectedLimit: null },
  { name: 'optimism', displayName: 'Optimism', expectedLimit: null },
  { name: 'base', displayName: 'Base', expectedLimit: null },
  { name: 'avalanche', displayName: 'Avalanche', expectedLimit: null }
];

// Test ranges - progressively larger
const TEST_RANGES = [
  { name: 'Small', blocks: 10 },
  { name: 'Medium', blocks: 100 },
  { name: 'Large', blocks: 500 },
  { name: 'Very Large', blocks: 1000 }
];

async function testNetwork(networkConfig) {
  console.log('\n' + '='.repeat(80));
  console.log(`Testing: ${networkConfig.displayName} (${networkConfig.name})`);
  if (networkConfig.expectedLimit) {
    console.log(`Expected limit: ${networkConfig.expectedLimit.toLocaleString()} logs`);
  }
  console.log('='.repeat(80));

  const client = new AlchemyRPCClient(networkConfig.name);
  const results = {
    network: networkConfig.name,
    maxLogs: 0,
    limits: [],
    errors: []
  };

  try {
    const currentBlock = await client.getBlockNumber();
    console.log(`Current block: ${currentBlock.toLocaleString()}\n`);

    for (const range of TEST_RANGES) {
      const fromBlock = currentBlock - range.blocks;
      const toBlock = currentBlock;

      console.log(`${range.name} range (${range.blocks} blocks): ${fromBlock.toLocaleString()} → ${toBlock.toLocaleString()}`);

      try {
        const startTime = Date.now();
        const logs = await client.getLogs({
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: `0x${toBlock.toString(16)}`,
          topics: [TRANSFER_EVENT]
        });
        const duration = Date.now() - startTime;

        console.log(`  ✅ SUCCESS: ${logs.length.toLocaleString()} logs in ${duration}ms`);

        if (logs.length > results.maxLogs) {
          results.maxLogs = logs.length;
        }

        // Check if we hit a limit (exact round number)
        if (logs.length % 10000 === 0 && logs.length > 0) {
          console.log(`  ⚠️  WARNING: Exactly ${logs.length.toLocaleString()} logs - possible limit!`);
          results.limits.push({ range: range.name, count: logs.length });
        }

      } catch (error) {
        const errorMsg = error.message.slice(0, 150);
        console.log(`  ❌ ERROR: ${errorMsg}`);

        // Track specific error types
        if (error.message.includes('limit')) {
          const limitMatch = error.message.match(/(\d+)/);
          if (limitMatch) {
            results.limits.push({
              range: range.name,
              count: parseInt(limitMatch[0]),
              error: true
            });
          }
        }

        results.errors.push({
          range: range.name,
          blocks: range.blocks,
          message: errorMsg
        });
      }

      // Small delay between tests
      await new Promise(resolve => setTimeout(resolve, 500));
    }

  } catch (error) {
    console.log(`\n❌ Failed to initialize ${networkConfig.displayName}: ${error.message}`);
    results.errors.push({
      range: 'initialization',
      message: error.message
    });
  }

  return results;
}

async function runAllTests() {
  console.log('='.repeat(80));
  console.log('Network Logs Limit Testing');
  console.log('='.repeat(80));
  console.log(`Using Alchemy API Key: ${process.env.ALCHEMY_API_KEY ? '***' + process.env.ALCHEMY_API_KEY.slice(-4) : 'NOT SET'}\n`);

  const allResults = [];

  for (const network of NETWORKS) {
    const result = await testNetwork(network);
    allResults.push(result);

    // Delay between networks
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY - Maximum Logs Retrieved by Network');
  console.log('='.repeat(80));
  console.log('');

  const summary = allResults.map(r => ({
    network: NETWORKS.find(n => n.name === r.network)?.displayName || r.network,
    maxLogs: r.maxLogs,
    limits: r.limits,
    hasErrors: r.errors.length > 0
  }));

  summary.forEach(s => {
    console.log(`${s.network}:`);
    console.log(`  Max logs fetched: ${s.maxLogs.toLocaleString()}`);

    if (s.limits.length > 0) {
      console.log(`  Detected limits:`);
      s.limits.forEach(l => {
        const status = l.error ? '(ERROR)' : '(EXACT COUNT)';
        console.log(`    - ${l.count.toLocaleString()} ${status}`);
      });
    }

    if (s.hasErrors) {
      console.log(`  ⚠️  Had errors during testing`);
    }
    console.log('');
  });

  // Find the highest log count achieved
  const maxOverall = Math.max(...summary.map(s => s.maxLogs));
  const networkWithMax = summary.find(s => s.maxLogs === maxOverall);

  console.log('='.repeat(80));
  console.log(`Highest log count achieved: ${maxOverall.toLocaleString()} logs`);
  console.log(`Network: ${networkWithMax.network}`);
  console.log('='.repeat(80));
}

// Run tests
if (require.main === module) {
  runAllTests()
    .then(() => {
      console.log('\nAll tests completed.');
      process.exit(0);
    })
    .catch(error => {
      console.error('\nTest suite failed:', error);
      process.exit(1);
    });
}

module.exports = { testNetwork, runAllTests };

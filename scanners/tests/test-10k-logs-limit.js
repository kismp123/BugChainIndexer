/**
 * Test to verify Alchemy's 10,000 logs limit for eth_getLogs
 *
 * This test attempts to fetch logs from a large block range to trigger
 * the 10K logs limit and verify how Alchemy handles it.
 */

const { AlchemyRPCClient } = require('../common/alchemyRpc');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// Disable proxy for this test
process.env.USE_ALCHEMY_PROXY = 'false';

const TRANSFER_EVENT = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function testLogsLimit() {
  console.log('='.repeat(80));
  console.log('Testing Alchemy eth_getLogs 10,000 Logs Limit');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Using Alchemy API Key: ${process.env.ALCHEMY_API_KEY ? '***' + process.env.ALCHEMY_API_KEY.slice(-4) : 'NOT SET'}`);
  console.log('');

  // Test on Ethereum mainnet (most active chain)
  const network = 'ethereum';
  const client = new AlchemyRPCClient(network);

  try {
    // Get current block
    const currentBlock = await client.getBlockNumber();
    console.log(`Current block: ${currentBlock.toLocaleString()}`);
    console.log('');

    // Test 1: Small range (should succeed)
    console.log('Test 1: Small range (10 blocks)');
    console.log('-'.repeat(80));
    try {
      const fromBlock = currentBlock - 10;
      const toBlock = currentBlock;

      console.log(`Querying blocks ${fromBlock.toLocaleString()} to ${toBlock.toLocaleString()}`);
      const startTime = Date.now();

      const logs = await client.getLogs({
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        topics: [TRANSFER_EVENT]
      });

      const duration = Date.now() - startTime;
      console.log(`✅ SUCCESS: Fetched ${logs.length.toLocaleString()} logs in ${duration}ms`);
      console.log('');
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      console.log('');
    }

    // Test 2: Medium range (likely to get close to 10K)
    console.log('Test 2: Medium range (100 blocks)');
    console.log('-'.repeat(80));
    try {
      const fromBlock = currentBlock - 100;
      const toBlock = currentBlock;

      console.log(`Querying blocks ${fromBlock.toLocaleString()} to ${toBlock.toLocaleString()}`);
      const startTime = Date.now();

      const logs = await client.getLogs({
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        topics: [TRANSFER_EVENT]
      });

      const duration = Date.now() - startTime;
      console.log(`✅ SUCCESS: Fetched ${logs.length.toLocaleString()} logs in ${duration}ms`);

      if (logs.length >= 10000) {
        console.log('⚠️  WARNING: Returned exactly 10,000 logs - might be capped!');
      }
      console.log('');
    } catch (error) {
      console.log(`❌ FAILED: ${error.message}`);
      console.log('');
    }

    // Test 3: Large range (should trigger 10K limit)
    console.log('Test 3: Large range (1,000 blocks - should trigger 10K limit)');
    console.log('-'.repeat(80));
    try {
      const fromBlock = currentBlock - 1000;
      const toBlock = currentBlock;

      console.log(`Querying blocks ${fromBlock.toLocaleString()} to ${toBlock.toLocaleString()}`);
      const startTime = Date.now();

      const logs = await client.getLogs({
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        topics: [TRANSFER_EVENT]
      });

      const duration = Date.now() - startTime;
      console.log(`✅ SUCCESS: Fetched ${logs.length.toLocaleString()} logs in ${duration}ms`);

      if (logs.length >= 10000) {
        console.log('⚠️  WARNING: Returned exactly 10,000 logs - LIMIT REACHED!');
      } else {
        console.log(`ℹ️  Note: Only ${logs.length.toLocaleString()} logs returned (under 10K limit)`);
      }
      console.log('');
    } catch (error) {
      console.log(`❌ EXPECTED ERROR: ${error.message}`);

      // Check if error message mentions 10K limit
      if (error.message.includes('10000') ||
          error.message.includes('10,000') ||
          error.message.includes('query returned more than')) {
        console.log('✅ Confirmed: 10,000 logs limit exists!');
      }
      console.log('');
    }

    // Test 4: Very large range (definitely should trigger limit)
    console.log('Test 4: Very large range (10,000 blocks - should definitely trigger limit)');
    console.log('-'.repeat(80));
    try {
      const fromBlock = currentBlock - 10000;
      const toBlock = currentBlock;

      console.log(`Querying blocks ${fromBlock.toLocaleString()} to ${toBlock.toLocaleString()}`);
      const startTime = Date.now();

      const logs = await client.getLogs({
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        topics: [TRANSFER_EVENT]
      });

      const duration = Date.now() - startTime;
      console.log(`✅ SUCCESS: Fetched ${logs.length.toLocaleString()} logs in ${duration}ms`);

      if (logs.length >= 10000) {
        console.log('⚠️  CRITICAL: Returned 10,000+ logs - LIMIT CONFIRMED!');
      }
      console.log('');
    } catch (error) {
      console.log(`❌ EXPECTED ERROR: ${error.message}`);

      // Check if error message mentions 10K limit or suggests range
      if (error.message.includes('10000') ||
          error.message.includes('10,000') ||
          error.message.includes('query returned more than') ||
          error.message.includes('Try with this block range')) {
        console.log('✅ CONFIRMED: 10,000 logs limit exists and is enforced!');

        // Try to extract suggested range
        const rangeMatch = error.message.match(/\[([0-9xa-fA-F]+),\s*([0-9xa-fA-F]+)\]/);
        if (rangeMatch) {
          const suggestedStart = parseInt(rangeMatch[1], 16);
          const suggestedEnd = parseInt(rangeMatch[2], 16);
          console.log(`ℹ️  Alchemy suggests range: blocks ${suggestedStart.toLocaleString()} to ${suggestedEnd.toLocaleString()} (${suggestedEnd - suggestedStart + 1} blocks)`);
        }
      }
      console.log('');
    }

    // Summary
    console.log('='.repeat(80));
    console.log('Test Summary');
    console.log('='.repeat(80));
    console.log('');
    console.log('The test attempted to verify if Alchemy enforces a 10,000 logs limit.');
    console.log('Check the results above to see:');
    console.log('  1. Small ranges should succeed');
    console.log('  2. Large ranges should either:');
    console.log('     - Return exactly 10,000 logs (silent cap), OR');
    console.log('     - Throw an error mentioning the limit');
    console.log('');

  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  testLogsLimit()
    .then(() => {
      console.log('Test completed.');
      process.exit(0);
    })
    .catch(error => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testLogsLimit };

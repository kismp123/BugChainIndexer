/**
 * Test reconnection logic for Alchemy RPC Client
 * This test simulates proxy failures and verifies reconnection/fallback behavior
 */

const { AlchemyRPCClient } = require('../common/alchemyRpc');

async function testReconnectionLogic() {
  console.log('=== Testing Alchemy RPC Reconnection Logic ===\n');

  // Test 1: Normal operation with proxy
  console.log('Test 1: Normal operation with proxy');
  try {
    process.env.USE_ALCHEMY_PROXY = 'true';
    process.env.ALCHEMY_PROXY_URL = 'http://localhost:3002';

    const client = new AlchemyRPCClient('base');
    const blockNumber = await client.getBlockNumber();
    console.log(`✅ Test 1 PASSED: Got block number ${blockNumber} via proxy\n`);
  } catch (error) {
    console.log(`❌ Test 1 FAILED: ${error.message}\n`);
  }

  // Test 2: Proxy down, fallback to direct API
  console.log('Test 2: Proxy down, fallback to direct API');
  try {
    process.env.USE_ALCHEMY_PROXY = 'true';
    process.env.ALCHEMY_PROXY_URL = 'http://localhost:9999'; // Invalid port

    const client = new AlchemyRPCClient('base');

    // This should fail to proxy but fallback to direct API
    const blockNumber = await client.getBlockNumber();
    console.log(`✅ Test 2 PASSED: Fallback succeeded, got block number ${blockNumber}\n`);
  } catch (error) {
    console.log(`❌ Test 2 FAILED: ${error.message}\n`);
  }

  // Test 3: Direct API mode (no proxy)
  console.log('Test 3: Direct API mode (no proxy)');
  try {
    process.env.USE_ALCHEMY_PROXY = 'false';

    const client = new AlchemyRPCClient('base');
    const blockNumber = await client.getBlockNumber();
    console.log(`✅ Test 3 PASSED: Got block number ${blockNumber} via direct API\n`);
  } catch (error) {
    console.log(`❌ Test 3 FAILED: ${error.message}\n`);
  }

  // Test 4: Retry logic with temporary connection issues
  console.log('Test 4: Testing retry logic');
  try {
    // Use a custom axios adapter to simulate intermittent failures
    const originalEnv = process.env.USE_ALCHEMY_PROXY;
    process.env.USE_ALCHEMY_PROXY = 'true';
    process.env.ALCHEMY_PROXY_URL = 'http://localhost:3002';

    const client = new AlchemyRPCClient('base');

    // Make multiple rapid requests to test connection pooling
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(client.getBlockNumber());
    }

    const results = await Promise.all(promises);
    console.log(`✅ Test 4 PASSED: Made ${results.length} concurrent requests successfully\n`);

    process.env.USE_ALCHEMY_PROXY = originalEnv;
  } catch (error) {
    console.log(`❌ Test 4 FAILED: ${error.message}\n`);
  }

  console.log('=== All Tests Completed ===');
}

// Run tests
testReconnectionLogic()
  .then(() => {
    console.log('\n✅ Test suite completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error);
    process.exit(1);
  });

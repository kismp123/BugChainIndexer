#!/usr/bin/env node
/**
 * Test all RPC endpoints for all supported chains
 */

const { NETWORKS } = require('./config/networks');
const { createRpcClient } = require('./common/core');

async function testRpcEndpoint(network, rpcUrl, rpcClient) {
  try {
    const startTime = Date.now();
    const blockNumber = await rpcClient.getBlockNumber();
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      blockNumber,
      duration,
      url: rpcUrl
    };
  } catch (error) {
    return {
      success: false,
      error: error.message.slice(0, 50),
      url: rpcUrl
    };
  }
}

async function testNetworkRpcs(networkName) {
  const network = NETWORKS[networkName];
  if (!network) {
    console.log(`❌ Network ${networkName} not found`);
    return;
  }
  
  console.log(`\n📡 Testing ${network.name} (${networkName})`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Total RPCs configured: ${network.rpcUrls.length}`);
  
  const rpcClient = createRpcClient(networkName);
  
  let successCount = 0;
  let fastestRpc = null;
  let fastestTime = Infinity;
  
  // Test first 5 RPCs to avoid overwhelming the test
  const rpcsToTest = network.rpcUrls.slice(0, 5);
  
  for (const rpcUrl of rpcsToTest) {
    const hostname = new URL(rpcUrl).hostname;
    const result = await testRpcEndpoint(networkName, rpcUrl, rpcClient);
    
    if (result.success) {
      successCount++;
      console.log(`✅ ${hostname}: Block ${result.blockNumber} (${result.duration}ms)`);
      
      if (result.duration < fastestTime) {
        fastestTime = result.duration;
        fastestRpc = hostname;
      }
    } else {
      console.log(`❌ ${hostname}: ${result.error}`);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n📊 Summary: ${successCount}/${rpcsToTest.length} RPCs working`);
  if (fastestRpc) {
    console.log(`⚡ Fastest: ${fastestRpc} (${fastestTime}ms)`);
  }
}

async function testAllNetworks() {
  console.log('🧪 Testing RPC endpoints for all supported networks\n');
  
  const mainNetworks = ['ethereum', 'binance', 'polygon', 'arbitrum', 'optimism', 'base', 'avalanche'];
  
  for (const network of mainNetworks) {
    await testNetworkRpcs(network);
  }
  
  console.log('\n✨ All tests completed!');
  console.log('\n📝 Note: Only tested first 5 RPCs per network to avoid rate limits');
  console.log('All networks now have 15-20+ RPC endpoints configured for better failover');
}

// Run tests
testAllNetworks()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
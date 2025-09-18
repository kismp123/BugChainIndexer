#!/usr/bin/env node
/**
 * Test script for RPC failover mechanism
 * This script tests timeout detection and automatic RPC switching
 */

const { createRpcClient } = require('./common/core');

async function testRpcFailover() {
  console.log('🧪 Testing RPC failover mechanism for Optimism network\n');
  
  const rpcClient = createRpcClient('optimism');
  
  console.log('Testing 1: Normal RPC call (getBlockNumber)');
  console.log('=========================================');
  
  try {
    const blockNumber = await rpcClient.getBlockNumber();
    console.log(`✅ Current block number: ${blockNumber}`);
    console.log('');
  } catch (error) {
    console.log(`❌ Failed to get block number: ${error.message}`);
    console.log('');
  }
  
  console.log('Testing 2: Multiple sequential calls to test rotation');
  console.log('=====================================================');
  
  for (let i = 0; i < 3; i++) {
    try {
      const startTime = Date.now();
      const blockNumber = await rpcClient.getBlockNumber();
      const duration = Date.now() - startTime;
      console.log(`Call ${i + 1}: Block ${blockNumber} (${duration}ms)`);
    } catch (error) {
      console.log(`Call ${i + 1}: Failed - ${error.message}`);
    }
  }
  
  console.log('');
  console.log('Testing 3: getLogs call (more likely to timeout with large range)');
  console.log('================================================================');
  
  try {
    const currentBlock = await rpcClient.getBlockNumber();
    const fromBlock = currentBlock - 1000;
    
    console.log(`Fetching logs from block ${fromBlock} to ${currentBlock}...`);
    const startTime = Date.now();
    
    const logs = await rpcClient.getLogs({
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${currentBlock.toString(16)}`,
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'] // Transfer event
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Fetched ${logs.length} logs in ${duration}ms`);
    
  } catch (error) {
    console.log(`❌ getLogs failed: ${error.message}`);
    if (error.message.includes('timeout')) {
      console.log('⚠️  Timeout detected - RPC should have switched automatically');
    }
  }
  
  console.log('');
  console.log('Testing 4: Simulate timeout by calling with very large block range');
  console.log('==================================================================');
  
  try {
    const currentBlock = await rpcClient.getBlockNumber();
    const fromBlock = currentBlock - 100000; // Very large range
    
    console.log(`Attempting to fetch logs for 100,000 blocks (likely to timeout)...`);
    const startTime = Date.now();
    
    const logs = await rpcClient.getLogs({
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${currentBlock.toString(16)}`,
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef']
    });
    
    const duration = Date.now() - startTime;
    console.log(`✅ Unexpectedly succeeded! Fetched ${logs.length} logs in ${duration}ms`);
    
  } catch (error) {
    console.log(`❌ Expected failure: ${error.message.slice(0, 100)}...`);
    if (error.message.includes('timeout')) {
      console.log('✅ Timeout correctly detected and handled');
    }
  }
  
  console.log('\n🎯 Test complete! Check the logs above for RPC switching messages.');
}

// Run the test
testRpcFailover()
  .then(() => {
    console.log('\n✨ All tests completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test script failed:', error);
    process.exit(1);
  });
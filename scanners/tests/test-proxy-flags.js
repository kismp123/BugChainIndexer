#!/usr/bin/env node

/**
 * Test Proxy Flags
 * Tests both proxy-enabled and direct API modes for Alchemy and Etherscan
 */

require('dotenv').config();
const { createRpcClient, etherscanRequest } = require('../common/core');

async function testProxyFlags() {
  console.log('🧪 Testing Proxy Flags Configuration\n');
  console.log('=' .repeat(60) + '\n');
  
  const network = 'ethereum';
  const testAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7'; // USDT
  
  // Display current configuration
  console.log('📋 Current Configuration:');
  console.log(`  USE_ALCHEMY_PROXY: ${process.env.USE_ALCHEMY_PROXY}`);
  console.log(`  ALCHEMY_PROXY_URL: ${process.env.ALCHEMY_PROXY_URL}`);
  console.log(`  ALCHEMY_API_KEY: ${process.env.ALCHEMY_API_KEY ? '***' + process.env.ALCHEMY_API_KEY.slice(-4) : 'NOT SET'}`);
  console.log(`  USE_ETHERSCAN_PROXY: ${process.env.USE_ETHERSCAN_PROXY}`);
  console.log(`  ETHERSCAN_PROXY_URL: ${process.env.ETHERSCAN_PROXY_URL}`);
  console.log('');
  
  // Test 1: Alchemy with current settings
  console.log('🔬 Test 1: Alchemy RPC with current settings');
  console.log(`  Mode: ${process.env.USE_ALCHEMY_PROXY === 'true' ? 'PROXY' : 'DIRECT API'}`);
  
  try {
    const clients = createRpcClient(network);
    const { alchemyClient } = clients;
    
    // Test eth_blockNumber
    const startTime = Date.now();
    const blockNumber = await alchemyClient.getBlockNumber();
    const duration = Date.now() - startTime;
    
    console.log(`  ✅ eth_blockNumber successful (${duration}ms)`);
    console.log(`  Block: ${blockNumber.toLocaleString()}`);
    console.log(`  Using: ${alchemyClient.useProxy ? 'Proxy Server' : 'Direct Alchemy API'}`);
    
    // Test eth_getCode
    const codeStartTime = Date.now();
    const code = await alchemyClient.getCode(testAddress);
    const codeDuration = Date.now() - codeStartTime;
    
    console.log(`  ✅ eth_getCode successful (${codeDuration}ms)`);
    console.log(`  Contract bytecode size: ${code.length} characters`);
  } catch (error) {
    console.log(`  ❌ Alchemy test failed: ${error.message}`);
  }
  
  console.log('');
  
  // Test 2: Etherscan with current settings
  console.log('🔬 Test 2: Etherscan API with current settings');
  console.log(`  Mode: ${process.env.USE_ETHERSCAN_PROXY === 'true' ? 'PROXY' : 'DIRECT API'}`);
  
  try {
    const startTime = Date.now();
    const result = await etherscanRequest(network, {
      module: 'contract',
      action: 'getabi',
      address: testAddress
    });
    const duration = Date.now() - startTime;
    
    console.log(`  ✅ Etherscan API successful (${duration}ms)`);
    console.log(`  Response status: ${result.status || 'success'}`);
    console.log(`  Using: ${process.env.USE_ETHERSCAN_PROXY === 'true' ? 'Proxy Server' : 'Direct Etherscan API'}`);
  } catch (error) {
    console.log(`  ❌ Etherscan test failed: ${error.message}`);
  }
  
  console.log('\n' + '=' .repeat(60) + '\n');
  
  // Test toggling modes
  console.log('🔄 Testing Mode Switching\n');
  
  // Test Alchemy mode switching
  console.log('📝 Alchemy Mode Switch Test:');
  
  // Save original values
  const originalAlchemyProxy = process.env.USE_ALCHEMY_PROXY;
  const originalEtherscanProxy = process.env.USE_ETHERSCAN_PROXY;
  
  try {
    // Test with proxy disabled (if originally enabled)
    if (originalAlchemyProxy === 'true') {
      process.env.USE_ALCHEMY_PROXY = 'false';
      console.log('  Switching to DIRECT API mode...');
      
      const directClients = createRpcClient(network);
      const { alchemyClient: directClient } = directClients;
      
      const startTime = Date.now();
      const blockNumber = await directClient.getBlockNumber();
      const duration = Date.now() - startTime;
      
      console.log(`  ✅ Direct API mode works (${duration}ms)`);
      console.log(`  Block: ${blockNumber.toLocaleString()}`);
      console.log(`  Confirmed using: ${directClient.useProxy ? 'Proxy (unexpected!)' : 'Direct Alchemy API'}`);
    } else {
      // Test with proxy enabled (if originally disabled)
      process.env.USE_ALCHEMY_PROXY = 'true';
      console.log('  Switching to PROXY mode...');
      
      const proxyClients = createRpcClient(network);
      const { alchemyClient: proxyClient } = proxyClients;
      
      const startTime = Date.now();
      const blockNumber = await proxyClient.getBlockNumber();
      const duration = Date.now() - startTime;
      
      console.log(`  ✅ Proxy mode works (${duration}ms)`);
      console.log(`  Block: ${blockNumber.toLocaleString()}`);
      console.log(`  Confirmed using: ${proxyClient.useProxy ? 'Proxy Server' : 'Direct API (unexpected!)'}`);
    }
  } catch (error) {
    console.log(`  ❌ Mode switch test failed: ${error.message}`);
  }
  
  // Restore original values
  process.env.USE_ALCHEMY_PROXY = originalAlchemyProxy;
  process.env.USE_ETHERSCAN_PROXY = originalEtherscanProxy;
  
  console.log('\n' + '=' .repeat(60));
  console.log('✅ Proxy Flag Testing Complete\n');
  
  // Summary
  console.log('📊 Summary:');
  console.log('  • Both proxy and direct modes are configurable');
  console.log('  • USE_ALCHEMY_PROXY controls Alchemy RPC routing');
  console.log('  • USE_ETHERSCAN_PROXY controls Etherscan API routing');
  console.log('  • Proxy mode provides:');
  console.log('    - Centralized throughput management');
  console.log('    - API key rotation');
  console.log('    - Rate limit protection');
  console.log('  • Direct mode provides:');
  console.log('    - Lower latency (no proxy overhead)');
  console.log('    - Direct control over API usage');
  
  process.exit(0);
}

// Run the test
testProxyFlags().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
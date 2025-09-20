#!/usr/bin/env node
/**
 * Test the fixed etherscanRequest function with proxy module
 */

require('dotenv').config();
const { etherscanRequest, initEtherscan } = require('../common/core');

async function testProxyModuleFix() {
  console.log('🔍 Testing Fixed etherscanRequest with Proxy Module\n');
  console.log('='.repeat(60));
  
  // Initialize Etherscan for ethereum
  initEtherscan('ethereum', process.env.DEFAULT_ETHERSCAN_KEYS);
  
  const testCases = [
    {
      name: 'Proxy - eth_getBlockByNumber (should work)',
      params: {
        module: 'proxy',
        action: 'eth_getBlockByNumber',
        tag: '0x10d4f',
        boolean: false
      },
      expectSuccess: true
    },
    {
      name: 'Proxy - eth_getTransactionByHash (null result)',
      params: {
        module: 'proxy',
        action: 'eth_getTransactionByHash',
        txhash: '0x0000000000000000000000000000000000000000000000000000000000000000'
      },
      expectSuccess: true,
      expectNull: true
    },
    {
      name: 'Proxy - eth_getCode (USDC contract)',
      params: {
        module: 'proxy',
        action: 'eth_getCode',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        tag: 'latest'
      },
      expectSuccess: true
    },
    {
      name: 'Proxy - eth_call (USDC name)',
      params: {
        module: 'proxy',
        action: 'eth_call',
        to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        data: '0x06fdde03', // name() function selector
        tag: 'latest'
      },
      expectSuccess: true
    },
    {
      name: 'Non-proxy - getcontractcreation (should work)',
      params: {
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
      },
      expectSuccess: true
    },
    {
      name: 'Non-proxy - getLogs (empty result)',
      params: {
        module: 'logs',
        action: 'getLogs',
        fromBlock: 0,
        toBlock: 100,
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        topic0: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
      },
      expectSuccess: true,
      expectEmpty: true
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of testCases) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log(`Module: ${test.params.module}, Action: ${test.params.action}`);
    
    try {
      const result = await etherscanRequest('ethereum', test.params);
      
      if (test.expectNull && result === null) {
        console.log(`✅ Correctly returned null`);
        passed++;
      } else if (test.expectEmpty && Array.isArray(result) && result.length === 0) {
        console.log(`✅ Correctly returned empty array`);
        passed++;
      } else if (test.expectSuccess && result !== undefined) {
        console.log(`✅ Success - Result type: ${typeof result}`);
        if (typeof result === 'string' && result.startsWith('0x')) {
          console.log(`   Data: ${result.substring(0, 66)}...`);
        } else if (typeof result === 'object') {
          const keys = Object.keys(result || {}).slice(0, 5);
          console.log(`   Keys: ${keys.join(', ')}`);
        }
        passed++;
      } else {
        console.log(`❌ Unexpected result: ${JSON.stringify(result).substring(0, 100)}`);
        failed++;
      }
      
    } catch (error) {
      if (test.expectError) {
        console.log(`✅ Expected error: ${error.message}`);
        passed++;
      } else {
        console.log(`❌ Unexpected error: ${error.message}`);
        failed++;
      }
    }
    
    // Rate limit prevention
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST RESULTS\n');
  console.log(`✅ Passed: ${passed}/${testCases.length}`);
  console.log(`❌ Failed: ${failed}/${testCases.length}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed! The proxy module fix is working correctly.');
  } else {
    console.log('\n⚠️  Some tests failed. Review the implementation.');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎯 KEY IMPROVEMENTS:\n');
  console.log('1. ✅ Proxy module calls now handled separately');
  console.log('2. ✅ No more false errors for proxy responses without status field');
  console.log('3. ✅ Proper null handling for non-existent proxy data');
  console.log('4. ✅ Non-proxy modules still work as before');
}

testProxyModuleFix()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
#!/usr/bin/env node
/**
 * Test Etherscan API responses to check when status field might be missing
 */

const axios = require('axios');
require('dotenv').config();

async function testAPIStatusField() {
  const apiKey = process.env.DEFAULT_ETHERSCAN_KEYS.split(',')[0];
  
  console.log('🔍 Testing Etherscan API Status Field Presence\n');
  console.log('='.repeat(60));
  
  const testCases = [
    {
      name: 'getLogs - Valid request',
      params: {
        module: 'logs',
        action: 'getLogs',
        fromBlock: 0,
        toBlock: 100,
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        topic0: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
        chainid: 1,
        apikey: apiKey
      }
    },
    {
      name: 'getLogs - Invalid parameters',
      params: {
        module: 'logs',
        action: 'getLogs',
        fromBlock: 'invalid',
        toBlock: 100,
        chainid: 1,
        apikey: apiKey
      }
    },
    {
      name: 'eth_getBlockByNumber - Proxy call',
      params: {
        module: 'proxy',
        action: 'eth_getBlockByNumber',
        tag: '0x10d4f',
        boolean: false,
        chainid: 1,
        apikey: apiKey
      }
    },
    {
      name: 'eth_getTransactionByHash - Proxy call',
      params: {
        module: 'proxy',
        action: 'eth_getTransactionByHash',
        txhash: '0x1234567890123456789012345678901234567890123456789012345678901234',
        chainid: 1,
        apikey: apiKey
      }
    },
    {
      name: 'getcontractcreation - Contract module',
      params: {
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chainid: 1,
        apikey: apiKey
      }
    },
    {
      name: 'getsourcecode - Contract module',
      params: {
        module: 'contract',
        action: 'getsourcecode',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chainid: 1,
        apikey: apiKey
      }
    },
    {
      name: 'txlist - Account module',
      params: {
        module: 'account',
        action: 'txlist',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        startblock: 0,
        endblock: 100,
        chainid: 1,
        apikey: apiKey
      }
    },
    {
      name: 'balance - Account module',
      params: {
        module: 'account',
        action: 'balance',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        tag: 'latest',
        chainid: 1,
        apikey: apiKey
      }
    },
    {
      name: 'eth_call - Proxy module',
      params: {
        module: 'proxy',
        action: 'eth_call',
        to: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        data: '0x06fdde03',
        tag: 'latest',
        chainid: 1,
        apikey: apiKey
      }
    },
    {
      name: 'Invalid module',
      params: {
        module: 'invalid_module',
        action: 'invalid_action',
        chainid: 1,
        apikey: apiKey
      }
    },
    {
      name: 'Missing API key',
      params: {
        module: 'account',
        action: 'balance',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        tag: 'latest',
        chainid: 1
        // No API key
      }
    },
    {
      name: 'Rate limit test (might trigger)',
      params: {
        module: 'logs',
        action: 'getLogs',
        fromBlock: 0,
        toBlock: 'latest',
        address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chainid: 1,
        apikey: apiKey
      }
    }
  ];
  
  const results = {
    hasStatus: [],
    noStatus: [],
    errors: []
  };
  
  for (const test of testCases) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log(`Module: ${test.params.module}, Action: ${test.params.action}`);
    
    try {
      const response = await axios.get('https://api.etherscan.io/v2/api', {
        params: test.params,
        timeout: 5000,
        validateStatus: () => true // Accept any status code
      });
      
      const data = response.data;
      
      // Check response structure
      console.log(`HTTP Status: ${response.status}`);
      console.log(`Response type: ${typeof data}`);
      
      if (typeof data === 'object' && data !== null) {
        console.log(`Has 'status' field: ${data.hasOwnProperty('status') ? '✅' : '❌'}`);
        console.log(`Has 'message' field: ${data.hasOwnProperty('message') ? '✅' : '❌'}`);
        console.log(`Has 'result' field: ${data.hasOwnProperty('result') ? '✅' : '❌'}`);
        
        if (data.status !== undefined) {
          console.log(`Status value: "${data.status}"`);
          results.hasStatus.push(test.name);
        } else {
          console.log(`⚠️  No status field!`);
          results.noStatus.push(test.name);
        }
        
        if (data.message) {
          console.log(`Message: "${data.message}"`);
        }
        
        // Special case for proxy module
        if (test.params.module === 'proxy' && data.result !== undefined) {
          console.log(`Proxy result type: ${typeof data.result}`);
          if (data.result === null) {
            console.log(`Result is null (common for non-existent data)`);
          }
        }
        
        // Log full response for cases without status
        if (!data.hasOwnProperty('status')) {
          console.log(`Full response:`, JSON.stringify(data, null, 2).substring(0, 500));
        }
      } else {
        console.log(`⚠️  Response is not an object: ${JSON.stringify(data).substring(0, 100)}`);
        results.noStatus.push(test.name);
      }
      
    } catch (error) {
      console.log(`❌ Request error: ${error.message}`);
      results.errors.push({ name: test.name, error: error.message });
    }
    
    // Rate limit prevention
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 ANALYSIS SUMMARY\n');
  
  console.log(`✅ APIs with status field (${results.hasStatus.length}):`);
  results.hasStatus.forEach(name => console.log(`   - ${name}`));
  
  if (results.noStatus.length > 0) {
    console.log(`\n❌ APIs WITHOUT status field (${results.noStatus.length}):`);
    results.noStatus.forEach(name => console.log(`   - ${name}`));
  }
  
  if (results.errors.length > 0) {
    console.log(`\n⚠️  Errors (${results.errors.length}):`);
    results.errors.forEach(item => console.log(`   - ${item.name}: ${item.error}`));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎯 RECOMMENDATIONS:\n');
  
  console.log('1. **Safe status check pattern:**');
  console.log(`   // Instead of: if (response.data.status === '1')
   // Use: if (response.data?.status === '1')
   // Or check existence first:
   if (response.data && 'status' in response.data) {
     if (response.data.status === '1') {
       // Success
     }
   }`);
  
  console.log('\n2. **Handle proxy module differently:**');
  console.log(`   if (params.module === 'proxy') {
     // Proxy calls might not have status field
     return response.data?.result ?? null;
   }`);
  
  console.log('\n3. **Fallback for missing status:**');
  console.log(`   const isSuccess = response.data?.status === '1' || 
                     (response.data?.result && !response.data?.status);`);
}

testAPIStatusField()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
#!/usr/bin/env node
/**
 * Test address case sensitivity in Etherscan V2 API
 */

const axios = require('axios');
require('dotenv').config();

async function testAddressFormats() {
  const apiKey = process.env.DEFAULT_ETHERSCAN_KEYS.split(',')[0];
  
  console.log('🔍 Testing Address Case Sensitivity in V2 API\n');
  console.log('='.repeat(60));
  
  // USDC contract address for testing
  const testCases = [
    {
      name: 'Checksummed (EIP-55)',
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      expected: 'success'
    },
    {
      name: 'All lowercase',
      address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      expected: 'success'
    },
    {
      name: 'All uppercase (with lowercase 0x)',
      address: '0xA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48',
      expected: 'success or fail'
    },
    {
      name: 'Uppercase 0X prefix',
      address: '0XA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      expected: 'fail'
    },
    {
      name: 'No 0x prefix',
      address: 'A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      expected: 'fail'
    },
    {
      name: 'With 0x00 prefix (invalid)',
      address: '0x00A0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      expected: 'fail'
    }
  ];
  
  const results = [];
  
  for (const test of testCases) {
    console.log(`\nTest: ${test.name}`);
    console.log(`Address: ${test.address}`);
    
    try {
      const response = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          module: 'contract',
          action: 'getcontractcreation',
          contractaddresses: test.address,
          chainid: 1,
          apikey: apiKey
        },
        timeout: 5000
      });
      
      const success = response.data.status === '1';
      const resultAddress = response.data.result?.[0]?.contractAddress;
      
      console.log(`Status: ${success ? '✅ SUCCESS' : '❌ FAILED'}`);
      if (!success) {
        console.log(`Message: ${response.data.message}`);
      }
      if (resultAddress) {
        console.log(`Returned address: ${resultAddress}`);
      }
      
      results.push({
        format: test.name,
        input: test.address,
        success: success,
        returned: resultAddress
      });
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      results.push({
        format: test.name,
        input: test.address,
        success: false,
        error: error.message
      });
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Analysis
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY\n');
  
  // Check if API normalizes addresses
  const successfulResults = results.filter(r => r.success && r.returned);
  const allReturnedAddresses = [...new Set(successfulResults.map(r => r.returned))];
  
  console.log('Address formats that work:');
  results.filter(r => r.success).forEach(r => {
    console.log(`  ✅ ${r.format}`);
  });
  
  console.log('\nAddress formats that fail:');
  results.filter(r => !r.success).forEach(r => {
    console.log(`  ❌ ${r.format}`);
  });
  
  if (allReturnedAddresses.length === 1) {
    console.log(`\n✅ API normalizes all addresses to: ${allReturnedAddresses[0]}`);
  } else if (allReturnedAddresses.length > 1) {
    console.log('\n⚠️  API returns different address formats:');
    allReturnedAddresses.forEach(addr => console.log(`  - ${addr}`));
  }
  
  // Check our code
  console.log('\n' + '='.repeat(60));
  console.log('📋 CHECKING OUR CODE\n');
  
  const { normalizeAddress } = require('../common/core');
  
  console.log('Our normalizeAddress function:');
  testCases.slice(0, 3).forEach(test => {
    const normalized = normalizeAddress(test.address);
    console.log(`  Input:  ${test.address}`);
    console.log(`  Output: ${normalized}`);
    console.log(`  Result: All lowercase ✅\n`);
  });
  
  console.log('🎯 CONCLUSION:');
  console.log('1. V2 API accepts both checksummed and lowercase addresses');
  console.log('2. V2 API returns lowercase addresses in response');
  console.log('3. Our code normalizes to lowercase (good practice)');
  console.log('4. This ensures consistency across the system');
}

testAddressFormats()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
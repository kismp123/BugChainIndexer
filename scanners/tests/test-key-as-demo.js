#!/usr/bin/env node
/**
 * Test if API key can be used as Demo API key
 */

const axios = require('axios');
require('dotenv').config();

async function testKeyAsDemo() {
  const apiKey = process.env.DEFAULT_COINGECKO_KEY || '';
  
  if (!apiKey) {
    console.log('❌ No API key found in DEFAULT_COINGECKO_KEY');
    console.log('   Please set DEFAULT_COINGECKO_KEY in .env file');
    process.exit(1);
  }
  
  console.log('🔍 Testing API Key as Demo API\n');
  console.log('='.repeat(80));
  console.log(`API Key: ${apiKey}\n`);
  
  const results = [];
  
  // Test 1: Demo API with x_cg_demo_api_key parameter
  console.log('1️⃣  Test 1: Demo API with x_cg_demo_api_key parameter\n');
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'ethereum',
        vs_currencies: 'usd',
        x_cg_demo_api_key: apiKey
      },
      timeout: 10000
    });
    
    console.log('   ✅ SUCCESS! Demo API works');
    console.log('   ETH Price:', response.data.ethereum.usd);
    results.push({ test: 'Demo API (x_cg_demo_api_key)', status: 'SUCCESS', price: response.data.ethereum.usd });
  } catch (error) {
    console.log('   ❌ FAILED:', error.response?.status || error.message);
    if (error.response?.data) {
      console.log('   Error:', JSON.stringify(error.response.data, null, 2));
    }
    results.push({ test: 'Demo API (x_cg_demo_api_key)', status: 'FAILED', error: error.response?.status });
  }
  
  // Test 2: Demo API with header
  console.log('\n2️⃣  Test 2: Demo API with header\n');
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'ethereum',
        vs_currencies: 'usd'
      },
      headers: {
        'x-cg-demo-api-key': apiKey
      },
      timeout: 10000
    });
    
    console.log('   ✅ SUCCESS! Demo API with header works');
    console.log('   ETH Price:', response.data.ethereum.usd);
    results.push({ test: 'Demo API (header)', status: 'SUCCESS', price: response.data.ethereum.usd });
  } catch (error) {
    console.log('   ❌ FAILED:', error.response?.status || error.message);
    results.push({ test: 'Demo API (header)', status: 'FAILED', error: error.response?.status });
  }
  
  // Test 3: Demo API ping endpoint
  console.log('\n3️⃣  Test 3: Demo API ping endpoint\n');
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/ping', {
      params: {
        x_cg_demo_api_key: apiKey
      },
      timeout: 10000
    });
    
    console.log('   ✅ SUCCESS! Ping response:', response.data);
    results.push({ test: 'Demo API (ping)', status: 'SUCCESS' });
  } catch (error) {
    console.log('   ❌ FAILED:', error.response?.status || error.message);
    results.push({ test: 'Demo API (ping)', status: 'FAILED', error: error.response?.status });
  }
  
  // Test 4: Demo API key info endpoint
  console.log('\n4️⃣  Test 4: Demo API key info\n');
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/key', {
      params: {
        x_cg_demo_api_key: apiKey
      },
      timeout: 10000
    });
    
    console.log('   ✅ SUCCESS! Key info:', response.data);
    results.push({ test: 'Demo API (key info)', status: 'SUCCESS', data: response.data });
  } catch (error) {
    console.log('   ❌ FAILED:', error.response?.status || error.message);
    if (error.response?.data) {
      console.log('   Error:', JSON.stringify(error.response.data, null, 2));
    }
    results.push({ test: 'Demo API (key info)', status: 'FAILED', error: error.response?.status });
  }
  
  // Test 5: Token price on Demo API
  console.log('\n5️⃣  Test 5: Token price on Demo API\n');
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/token_price/ethereum', {
      params: {
        contract_addresses: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        vs_currencies: 'usd',
        x_cg_demo_api_key: apiKey
      },
      timeout: 10000
    });
    
    console.log('   ✅ SUCCESS! USDC Price:', response.data['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'].usd);
    results.push({ test: 'Demo API (token price)', status: 'SUCCESS', price: response.data['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'].usd });
  } catch (error) {
    console.log('   ❌ FAILED:', error.response?.status || error.message);
    results.push({ test: 'Demo API (token price)', status: 'FAILED', error: error.response?.status });
  }
  
  // Test 6: Free API (no key) for comparison
  console.log('\n6️⃣  Test 6: Free API (no key) for comparison\n');
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'ethereum',
        vs_currencies: 'usd'
      },
      timeout: 10000
    });
    
    console.log('   ✅ Free API works');
    console.log('   ETH Price:', response.data.ethereum.usd);
    results.push({ test: 'Free API', status: 'SUCCESS', price: response.data.ethereum.usd });
  } catch (error) {
    console.log('   ❌ FAILED:', error.response?.status || error.message);
    results.push({ test: 'Free API', status: 'FAILED', error: error.response?.status });
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY\n');
  
  const successCount = results.filter(r => r.status === 'SUCCESS').length;
  console.log(`Success: ${successCount}/${results.length} tests`);
  
  console.log('\n📋 Test Results:');
  results.forEach(r => {
    const icon = r.status === 'SUCCESS' ? '✅' : '❌';
    console.log(`   ${icon} ${r.test}: ${r.status}`);
    if (r.error) console.log(`      Error code: ${r.error}`);
  });
  
  console.log('\n🔍 Analysis:');
  
  if (results[0].status === 'SUCCESS' || results[1].status === 'SUCCESS') {
    console.log('   ✅ The key CAN be used as a Demo API key');
    console.log('   - Use parameter: x_cg_demo_api_key');
    console.log('   - Endpoint: https://api.coingecko.com/api/v3/');
    console.log('   - Rate limit: 30 calls/minute');
    console.log('   - Monthly limit: 10,000 calls');
  } else if (results[0].error === 400) {
    console.log('   ❌ The key is a Pro API key, not a Demo key');
    console.log('   - Error: Trying to use Pro key with Demo API endpoint');
    console.log('   - Solution: Use https://pro-api.coingecko.com/api/v3/');
    console.log('   - But the Pro subscription is deactivated');
  } else {
    console.log('   ⚠️  Unable to determine key type');
    console.log('   - The key might be invalid or expired');
  }
  
  return results;
}

testKeyAsDemo()
  .then(results => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
#!/usr/bin/env node
/**
 * Test CoinGecko Demo API
 */

const axios = require('axios');
require('dotenv').config();

async function testDemoAPI() {
  console.log('🔍 Testing CoinGecko Demo API\n');
  console.log('='.repeat(80));
  
  const demoKey = process.env.DEFAULT_COINGECKO_KEY || '';
  console.log(`Demo Key: ${demoKey ? '✅ ' + demoKey : '❌ Missing'}\n`);
  
  // Test with demo API
  console.log('Testing Demo API endpoints:\n');
  
  // Test 1: Simple price (native tokens)
  console.log('1. Testing native token prices...');
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'ethereum,binancecoin,matic-network',
        vs_currencies: 'usd',
        x_cg_demo_api_key: demoKey
      },
      timeout: 10000
    });
    
    console.log('   ✅ Success! Prices:');
    Object.entries(response.data).forEach(([coin, data]) => {
      console.log(`      ${coin}: $${data.usd}`);
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} - ${error.response?.data?.status?.error_message || error.message}`);
  }
  
  // Test 2: Token prices by platform
  console.log('\n2. Testing token prices (Ethereum USDC)...');
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/token_price/ethereum', {
      params: {
        contract_addresses: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        vs_currencies: 'usd',
        x_cg_demo_api_key: demoKey
      },
      timeout: 10000
    });
    
    console.log('   ✅ Success! USDC price:', response.data);
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status} - ${error.response?.data?.status?.error_message || error.message}`);
  }
  
  // Test 3: Multiple tokens
  console.log('\n3. Testing multiple tokens on different chains...');
  const testChains = [
    { chain: 'ethereum', token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', name: 'USDC' },
    { chain: 'binance-smart-chain', token: '0x55d398326f99059ff775485246999027b3197955', name: 'USDT' },
    { chain: 'polygon-pos', token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', name: 'USDC' }
  ];
  
  for (const test of testChains) {
    try {
      const response = await axios.get(`https://api.coingecko.com/api/v3/simple/token_price/${test.chain}`, {
        params: {
          contract_addresses: test.token,
          vs_currencies: 'usd',
          x_cg_demo_api_key: demoKey
        },
        timeout: 10000
      });
      
      const price = response.data[test.token.toLowerCase()]?.usd;
      console.log(`   ✅ ${test.chain} ${test.name}: $${price}`);
    } catch (error) {
      console.log(`   ❌ ${test.chain}: ${error.response?.status} - ${error.message}`);
    }
    
    await new Promise(r => setTimeout(r, 1000)); // Rate limit
  }
  
  // Test with API key status check
  console.log('\n4. Checking API key status...');
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/key', {
      params: {
        x_cg_demo_api_key: demoKey
      },
      timeout: 10000
    });
    
    console.log('   ✅ API Key Info:');
    console.log('      Plan:', response.data.plan);
    console.log('      Rate Limit:', response.data.rate_limit_request_per_minute, 'req/min');
    console.log('      Monthly Limit:', response.data.monthly_call_credit);
  } catch (error) {
    if (error.response?.data?.error_code === 10004) {
      console.log('   ❌ API key is DEACTIVATED (error_code: 10004)');
      console.log('   Subscription has been deactivated');
    } else {
      console.log(`   ❌ Error checking key: ${error.response?.status}`);
      if (error.response?.data) {
        console.log('   Response:', JSON.stringify(error.response.data, null, 2));
      }
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY\n');
  
  if (demoKey) {
    console.log('✅ Demo key is present');
    console.log('⚠️  Limitations:');
    console.log('   - 30 calls per minute');
    console.log('   - 10,000 calls per month');
    console.log('   - Need 2+ second delays between calls');
    console.log('\n🔧 Recommendations:');
    console.log('   1. Use 2-3 second delays between API calls');
    console.log('   2. Batch token prices when possible');
    console.log('   3. Cache prices aggressively');
    console.log('   4. Consider upgrading to paid plan for production');
  } else {
    console.log('❌ No demo key found');
    console.log('   Using free tier (10-30 calls/min)');
  }
}

testDemoAPI()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
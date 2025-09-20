#!/usr/bin/env node
/**
 * Test CoinGecko Pro API
 */

const axios = require('axios');
require('dotenv').config();

async function testProAPI() {
  console.log('🔍 Testing CoinGecko Pro API\n');
  console.log('='.repeat(80));
  
  const proKey = process.env.DEFAULT_COINGECKO_KEY || '';
  console.log(`Pro Key: ${proKey ? '✅ ' + proKey : '❌ Missing'}\n`);
  
  // Test with Pro API
  console.log('Testing Pro API endpoints:\n');
  
  // Test 1: Simple price (native tokens)
  console.log('1. Testing native token prices...');
  try {
    const response = await axios.get('https://pro-api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'ethereum,binancecoin,matic-network,avalanche-2',
        vs_currencies: 'usd',
        x_cg_pro_api_key: proKey
      },
      timeout: 10000
    });
    
    console.log('   ✅ Success! Prices:');
    Object.entries(response.data).forEach(([coin, data]) => {
      console.log(`      ${coin}: $${data.usd}`);
    });
  } catch (error) {
    console.log(`   ❌ Error: ${error.response?.status}`);
    if (error.response?.data) {
      console.log('   Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  // Test 2: Token prices by platform
  console.log('\n2. Testing token prices on different chains...');
  const testTokens = [
    { chain: 'ethereum', token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', name: 'USDC' },
    { chain: 'binance-smart-chain', token: '0x55d398326f99059ff775485246999027b3197955', name: 'USDT' },
    { chain: 'polygon-pos', token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', name: 'USDC' },
    { chain: 'arbitrum-one', token: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', name: 'USDC' },
    { chain: 'optimistic-ethereum', token: '0x7f5c764cbc14f9669b88837ca1490cca17c31607', name: 'USDC' },
    { chain: 'base', token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', name: 'USDC' }
  ];
  
  for (const test of testTokens) {
    try {
      const response = await axios.get(`https://pro-api.coingecko.com/api/v3/simple/token_price/${test.chain}`, {
        params: {
          contract_addresses: test.token,
          vs_currencies: 'usd',
          x_cg_pro_api_key: proKey
        },
        timeout: 10000
      });
      
      const price = response.data[test.token.toLowerCase()]?.usd;
      console.log(`   ✅ ${test.chain.padEnd(25)} ${test.name}: $${price || 'N/A'}`);
    } catch (error) {
      console.log(`   ❌ ${test.chain.padEnd(25)}: ${error.response?.status} - ${error.message}`);
    }
    
    await new Promise(r => setTimeout(r, 500)); // Rate limit for Pro API
  }
  
  // Test 3: Check API status
  console.log('\n3. Checking API key status...');
  try {
    const response = await axios.get('https://pro-api.coingecko.com/api/v3/key', {
      params: {
        x_cg_pro_api_key: proKey
      },
      timeout: 10000
    });
    
    console.log('   ✅ API Key Info:');
    console.log('      Plan:', response.data.plan);
    console.log('      Rate Limit:', response.data.rate_limit_request_per_minute, 'req/min');
    console.log('      Monthly Call Limit:', response.data.monthly_call_credit);
    console.log('      Current Usage:', response.data.current_total_monthly_calls);
    console.log('      Remaining:', response.data.current_remaining_monthly_calls);
  } catch (error) {
    console.log(`   ❌ Error checking key status: ${error.response?.status}`);
    if (error.response?.data) {
      console.log('   Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY\n');
  
  console.log('🔧 FundUpdater Configuration:');
  console.log('   1. Set apiMode to "pro" in constructor');
  console.log('   2. Use pro-api.coingecko.com endpoint');
  console.log('   3. Pass x_cg_pro_api_key in params');
  console.log('   4. Implement proper rate limiting based on plan');
  console.log('\n📝 Note: If API key is deactivated, fall back to free API');
}

testProAPI()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
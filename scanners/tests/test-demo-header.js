#!/usr/bin/env node
/**
 * Test Demo API using header method
 */

const axios = require('axios');
require('dotenv').config();

async function testDemoWithHeader() {
  const apiKey = process.env.DEFAULT_COINGECKO_KEY || '';
  
  console.log('🔍 Testing Demo API with Header Method\n');
  console.log('='.repeat(80));
  console.log(`API Key: ${apiKey}\n`);
  
  const testCases = [
    {
      name: 'Native Token Price (ETH)',
      url: 'https://api.coingecko.com/api/v3/simple/price',
      params: { ids: 'ethereum', vs_currencies: 'usd' }
    },
    {
      name: 'Multiple Native Tokens',
      url: 'https://api.coingecko.com/api/v3/simple/price',
      params: { ids: 'ethereum,binancecoin,matic-network,avalanche-2', vs_currencies: 'usd' }
    },
    {
      name: 'Token Price (Ethereum USDC)',
      url: 'https://api.coingecko.com/api/v3/simple/token_price/ethereum',
      params: { 
        contract_addresses: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        vs_currencies: 'usd'
      }
    },
    {
      name: 'Token Price (BSC USDT)',
      url: 'https://api.coingecko.com/api/v3/simple/token_price/binance-smart-chain',
      params: {
        contract_addresses: '0x55d398326f99059ff775485246999027b3197955',
        vs_currencies: 'usd'
      }
    },
    {
      name: 'Token Price (Polygon USDC)',
      url: 'https://api.coingecko.com/api/v3/simple/token_price/polygon-pos',
      params: {
        contract_addresses: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
        vs_currencies: 'usd'
      }
    },
    {
      name: 'Platform List',
      url: 'https://api.coingecko.com/api/v3/asset_platforms',
      params: {}
    }
  ];
  
  let successCount = 0;
  let failCount = 0;
  const results = [];
  
  for (let i = 0; i < testCases.length; i++) {
    const test = testCases[i];
    console.log(`\n${i + 1}. ${test.name}`);
    
    try {
      const response = await axios.get(test.url, {
        params: test.params,
        headers: {
          'x-cg-demo-api-key': apiKey
        },
        timeout: 10000
      });
      
      console.log('   ✅ SUCCESS');
      
      // Show relevant data
      if (test.name.includes('Native Token')) {
        const prices = response.data;
        for (const [coin, data] of Object.entries(prices)) {
          console.log(`   ${coin}: $${data.usd}`);
        }
      } else if (test.name.includes('Token Price')) {
        const prices = response.data;
        for (const [address, data] of Object.entries(prices)) {
          console.log(`   ${address.substring(0, 10)}...: $${data.usd}`);
        }
      } else if (test.name === 'Platform List') {
        console.log(`   Total platforms: ${response.data.length}`);
      }
      
      successCount++;
      results.push({ test: test.name, status: 'SUCCESS' });
      
      // Rate limit: 30 req/min for Demo API
      if (i < testCases.length - 1) {
        console.log('   ⏳ Waiting 2 seconds (Demo API rate limit)...');
        await new Promise(r => setTimeout(r, 2000));
      }
      
    } catch (error) {
      console.log('   ❌ FAILED:', error.response?.status || error.message);
      if (error.response?.data) {
        console.log('   Error:', error.response.data?.status?.error_message || JSON.stringify(error.response.data));
      }
      failCount++;
      results.push({ test: test.name, status: 'FAILED', error: error.response?.status });
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY\n');
  
  console.log(`✅ Success: ${successCount}/${testCases.length}`);
  console.log(`❌ Failed: ${failCount}/${testCases.length}`);
  
  console.log('\n📋 Detailed Results:');
  results.forEach(r => {
    const icon = r.status === 'SUCCESS' ? '✅' : '❌';
    console.log(`   ${icon} ${r.test}`);
  });
  
  if (successCount === testCases.length) {
    console.log('\n🎉 EXCELLENT! Demo API works perfectly with header method!');
    console.log('\n🔧 Configuration for FundUpdater:');
    console.log('   1. Use endpoint: https://api.coingecko.com/api/v3/');
    console.log('   2. Send key as header: x-cg-demo-api-key');
    console.log('   3. Rate limit: 30 calls/minute');
    console.log('   4. Use 2-second delays between calls');
  } else if (successCount > 0) {
    console.log('\n⚠️  Partial success - some endpoints work with Demo API');
  } else {
    console.log('\n❌ Demo API does not work with this key');
  }
}

testDemoWithHeader()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
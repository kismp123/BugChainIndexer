#!/usr/bin/env node
/**
 * Test actual CoinGecko API calls for each network
 */

const axios = require('axios');
require('dotenv').config();

async function testCoinGeckoAPI() {
  console.log('🔍 Testing CoinGecko API for Each Network\n');
  console.log('='.repeat(80));
  
  const apiKey = process.env.DEFAULT_COINGECKO_KEY || '';
  console.log(`API Key: ${apiKey ? '✅ ' + apiKey : '❌ Missing'}\n`);
  
  // Test networks with their platform IDs and a sample token
  const testCases = [
    { network: 'ethereum', platform: 'ethereum', token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', name: 'USDC' },
    { network: 'binance', platform: 'binance-smart-chain', token: '0x55d398326f99059ff775485246999027b3197955', name: 'USDT' },
    { network: 'polygon', platform: 'polygon-pos', token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', name: 'USDC' },
    { network: 'arbitrum', platform: 'arbitrum-one', token: '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', name: 'USDC' },
    { network: 'optimism', platform: 'optimistic-ethereum', token: '0x7f5c764cbc14f9669b88837ca1490cca17c31607', name: 'USDC' },
    { network: 'base', platform: 'base', token: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', name: 'USDC' },
    { network: 'avalanche', platform: 'avalanche', token: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e', name: 'USDC' },
    { network: 'linea', platform: 'linea', token: '0x176211869ca2b568f2a7d4ee941e073a821ee1ff', name: 'USDC' },
    { network: 'scroll', platform: 'scroll', token: '0x06efdbff2a14a7c8e15944d1f4a48f9f95f663a4', name: 'USDC' },
    { network: 'mantle', platform: 'mantle', token: '0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9', name: 'USDC' },
  ];
  
  const results = {
    success: [],
    failed: [],
    unsupported: []
  };
  
  for (const test of testCases) {
    console.log(`\n📝 Testing ${test.network} (${test.platform})`);
    console.log(`   Token: ${test.name} - ${test.token}`);
    
    try {
      // Always use free API since the key is deactivated
      const url = `https://api.coingecko.com/api/v3/simple/token_price/${test.platform}`;
      const headers = {};
      
      const response = await axios.get(url, {
        params: {
          contract_addresses: test.token,
          vs_currencies: 'usd'
        },
        headers,
        timeout: 10000
      });
      
      const price = response.data[test.token.toLowerCase()]?.usd;
      
      if (price !== undefined) {
        console.log(`   ✅ Success! Price: $${price}`);
        results.success.push({ ...test, price });
      } else {
        console.log(`   ⚠️  No price data returned`);
        console.log(`   Response:`, JSON.stringify(response.data));
        results.unsupported.push(test);
      }
      
    } catch (error) {
      if (error.response?.status === 404) {
        console.log(`   ❌ Platform not supported by CoinGecko`);
        results.unsupported.push(test);
      } else if (error.response?.status === 429) {
        console.log(`   ⚠️  Rate limit exceeded`);
        results.failed.push({ ...test, error: 'Rate limit' });
      } else {
        console.log(`   ❌ Error: ${error.message}`);
        if (error.response?.data) {
          console.log(`   Response:`, JSON.stringify(error.response.data));
        }
        results.failed.push({ ...test, error: error.message });
      }
    }
    
    // Rate limiting for free tier (10-30 calls/min)
    await new Promise(r => setTimeout(r, 6000)); // 6 seconds between calls
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 API TEST RESULTS\n');
  
  console.log(`✅ Working: ${results.success.length}/${testCases.length}`);
  results.success.forEach(r => {
    console.log(`   ${r.network}: $${r.price} for ${r.name}`);
  });
  
  if (results.unsupported.length > 0) {
    console.log(`\n⚠️  Unsupported platforms: ${results.unsupported.length}`);
    results.unsupported.forEach(r => {
      console.log(`   ${r.network} (${r.platform})`);
    });
  }
  
  if (results.failed.length > 0) {
    console.log(`\n❌ Failed: ${results.failed.length}`);
    results.failed.forEach(r => {
      console.log(`   ${r.network}: ${r.error}`);
    });
  }
  
  // Check available platforms
  console.log('\n' + '='.repeat(80));
  console.log('📋 Checking Available Platforms on CoinGecko...\n');
  
  try {
    // Use free API
    const platformsUrl = 'https://api.coingecko.com/api/v3/asset_platforms';
    
    const platformsResponse = await axios.get(platformsUrl, {
      headers: {},
      timeout: 10000
    });
    
    const platforms = platformsResponse.data
      .filter(p => p.id && p.chain_identifier)
      .map(p => ({ id: p.id, chainId: p.chain_identifier, name: p.name }));
    
    // Check which of our networks are available
    const ourPlatforms = [
      'ethereum', 'binance-smart-chain', 'polygon-pos', 'arbitrum-one',
      'optimistic-ethereum', 'base', 'avalanche', 'xdai', 'linea',
      'scroll', 'mantle', 'opbnb', 'polygon-zkevm', 'arbitrum-nova',
      'celo', 'cronos', 'moonbeam', 'moonriver'
    ];
    
    console.log('Our platforms available on CoinGecko:');
    ourPlatforms.forEach(pid => {
      const found = platforms.find(p => p.id === pid);
      if (found) {
        console.log(`  ✅ ${pid} (Chain ID: ${found.chainId})`);
      } else {
        console.log(`  ❌ ${pid} - NOT FOUND`);
      }
    });
    
  } catch (error) {
    console.log('Failed to fetch platform list:', error.message);
  }
  
  console.log('\n🎯 RECOMMENDATIONS:\n');
  
  if (!apiKey) {
    console.log('1. ⚠️  No API key detected - using free tier with strict rate limits');
    console.log('   Set DEFAULT_COINGECKO_KEY in .env');
  }
  
  if (results.unsupported.length > 0) {
    console.log('\n2. Some platforms may not be supported by CoinGecko');
    console.log('   Consider using alternative price sources for:', 
      results.unsupported.map(r => r.network).join(', '));
  }
}

testCoinGeckoAPI()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
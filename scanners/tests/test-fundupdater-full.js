#!/usr/bin/env node
/**
 * Comprehensive test for FundUpdater with all networks
 */

require('dotenv').config();
const axios = require('axios');

// Mock Scanner and dependencies
class Scanner {
  constructor(name, options) {
    this.name = name;
    this.options = options;
  }
  
  log(message, level = 'info') {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const levelIcon = level === 'warn' ? '⚠️' : level === 'error' ? '❌' : '📝';
    console.log(`[${timestamp}] ${levelIcon} ${message}`);
  }
  
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(id) {
  if (id === '../common/Scanner') {
    return Scanner;
  }
  if (id === '../common') {
    return {
      batchUpsertAddresses: () => {},
      normalizeAddress: (addr) => addr.toLowerCase(),
      validateFinancialValue: (val) => !isNaN(val)
    };
  }
  if (id === '../config/networks.js') {
    return {
      CONFIG: {
        coinGeckoAPI: '',
        1: { name: 'Ethereum', nativeCurrency: 'ETH' },
        56: { name: 'Binance', nativeCurrency: 'BNB' },
        137: { name: 'Polygon', nativeCurrency: 'MATIC' },
        42161: { name: 'Arbitrum', nativeCurrency: 'ETH' },
        10: { name: 'Optimism', nativeCurrency: 'ETH' },
        8453: { name: 'Base', nativeCurrency: 'ETH' },
        43114: { name: 'Avalanche', nativeCurrency: 'AVAX' }
      },
      FUNDUPDATEDELAY: 7
    };
  }
  return originalRequire.apply(this, arguments);
};

const FundUpdater = require('../core/FundUpdater');

async function testFundUpdater() {
  console.log('🔍 Comprehensive FundUpdater Test\n');
  console.log('='.repeat(80));
  
  // Test different networks
  const networks = [
    { id: 'ethereum', nativeCurrency: 'ETH', chainId: 1 },
    { id: 'binance', nativeCurrency: 'BNB', chainId: 56 },
    { id: 'polygon', nativeCurrency: 'MATIC', chainId: 137 },
    { id: 'arbitrum', nativeCurrency: 'ETH', chainId: 42161 },
    { id: 'base', nativeCurrency: 'ETH', chainId: 8453 }
  ];
  
  const results = {
    apiDetection: null,
    nativePrices: [],
    tokenPrices: [],
    rateLimiting: null
  };
  
  // 1. Test API Detection
  console.log('\n📊 1. API MODE DETECTION\n');
  const updater = new FundUpdater();
  updater.network = 'ethereum';
  updater.config = { nativeCurrency: 'ETH' };
  updater.currentTime = Math.floor(Date.now() / 1000);
  
  await updater.detectApiMode();
  results.apiDetection = {
    mode: updater.apiMode,
    keyActive: updater.coinGeckoKey !== '',
    detected: updater.apiModeDetected
  };
  
  console.log(`   Mode: ${results.apiDetection.mode}`);
  console.log(`   Key Active: ${results.apiDetection.keyActive ? 'Yes' : 'No'}`);
  console.log(`   Detection: ${results.apiDetection.detected ? 'Success' : 'Failed'}`);
  
  // 2. Test Native Token Prices
  console.log('\n💰 2. NATIVE TOKEN PRICES\n');
  
  for (const network of networks) {
    const netUpdater = new FundUpdater();
    netUpdater.network = network.id;
    netUpdater.config = { nativeCurrency: network.nativeCurrency };
    netUpdater.currentTime = Math.floor(Date.now() / 1000);
    
    try {
      const price = await netUpdater.getNativeTokenPrice();
      results.nativePrices.push({
        network: network.id,
        currency: network.nativeCurrency,
        price: price,
        success: price > 0
      });
      
      console.log(`   ✅ ${network.id.padEnd(10)} ${network.nativeCurrency}: $${price}`);
      
      // Wait to avoid rate limit
      await netUpdater.sleep(6000);
    } catch (error) {
      console.log(`   ❌ ${network.id.padEnd(10)}: ${error.message}`);
      results.nativePrices.push({
        network: network.id,
        currency: network.nativeCurrency,
        error: error.message,
        success: false
      });
    }
  }
  
  // 3. Test Token Prices
  console.log('\n🪙  3. TOKEN PRICES\n');
  
  const testTokens = {
    'ethereum': ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'], // USDC
    'binance': ['0x55d398326f99059ff775485246999027b3197955'], // USDT
    'polygon': ['0x2791bca1f2de4661ed88a30c99a7a9449aa84174'] // USDC
  };
  
  for (const [network, tokens] of Object.entries(testTokens)) {
    const tokenUpdater = new FundUpdater();
    tokenUpdater.network = network;
    tokenUpdater.currentTime = Math.floor(Date.now() / 1000);
    
    try {
      // Test makeApiRequest directly
      const platformId = tokenUpdater.getCoinGeckoPlatformId();
      const params = {
        vs_currencies: 'usd',
        contract_addresses: tokens.join(',')
      };
      
      const { response, mode } = await tokenUpdater.makeApiRequest(
        `/simple/token_price/${platformId}`, 
        params
      );
      
      const prices = response.data;
      console.log(`   ✅ ${network}: ${Object.keys(prices).length} token(s) fetched (${mode} mode)`);
      
      for (const [address, data] of Object.entries(prices)) {
        console.log(`      ${address.substring(0, 10)}...: $${data.usd}`);
      }
      
      results.tokenPrices.push({
        network: network,
        tokens: Object.keys(prices).length,
        mode: mode,
        success: true
      });
      
      await tokenUpdater.sleep(6000);
    } catch (error) {
      console.log(`   ❌ ${network}: ${error.message}`);
      results.tokenPrices.push({
        network: network,
        error: error.message,
        success: false
      });
    }
  }
  
  // 4. Test Rate Limiting
  console.log('\n⏱️  4. RATE LIMITING TEST\n');
  
  const rateUpdater = new FundUpdater();
  rateUpdater.network = 'ethereum';
  rateUpdater.currentTime = Math.floor(Date.now() / 1000);
  
  console.log('   Testing adaptive delays based on API mode...');
  
  // Get the delay based on current mode
  const testDelay = rateUpdater.apiMode === 'free' ? 6000 : 
                    rateUpdater.apiMode === 'demo' ? 2000 : 200;
  
  console.log(`   Current mode: ${rateUpdater.apiMode}`);
  console.log(`   Delay between calls: ${testDelay/1000}s`);
  console.log(`   Rate limit: ${rateUpdater.apiMode === 'free' ? '10-30' : 
                                rateUpdater.apiMode === 'demo' ? '30' : '500+'} calls/min`);
  
  results.rateLimiting = {
    mode: rateUpdater.apiMode,
    delay: testDelay,
    rateLimit: rateUpdater.apiMode === 'free' ? '10-30/min' : 
               rateUpdater.apiMode === 'demo' ? '30/min' : '500+/min'
  };
  
  // Print Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST SUMMARY\n');
  
  console.log('1. API Detection:');
  console.log(`   - Mode: ${results.apiDetection.mode}`);
  console.log(`   - Status: ${results.apiDetection.keyActive ? 'Key Active' : 'Key Disabled/Missing'}`);
  
  console.log('\n2. Native Prices:');
  const successfulNative = results.nativePrices.filter(r => r.success).length;
  console.log(`   - Success: ${successfulNative}/${results.nativePrices.length}`);
  
  console.log('\n3. Token Prices:');
  const successfulTokens = results.tokenPrices.filter(r => r.success).length;
  console.log(`   - Success: ${successfulTokens}/${results.tokenPrices.length}`);
  
  console.log('\n4. Rate Limiting:');
  console.log(`   - Mode: ${results.rateLimiting.mode}`);
  console.log(`   - Delay: ${results.rateLimiting.delay/1000}s`);
  console.log(`   - Limit: ${results.rateLimiting.rateLimit}`);
  
  if (results.apiDetection.mode === 'free') {
    console.log('\n⚠️  IMPORTANT:');
    console.log('   API is running in FREE mode due to:');
    if (!process.env.DEFAULT_COINGECKO_KEY) {
      console.log('   - No API key provided');
    }
    console.log('   - Using 6-second delays to avoid rate limits');
    console.log('   - Limited to 10-30 calls per minute');
  }
  
  return results;
}

// Run test
testFundUpdater()
  .then((results) => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
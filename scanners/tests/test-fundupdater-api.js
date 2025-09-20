#!/usr/bin/env node
/**
 * Test FundUpdater API key detection
 */

require('dotenv').config();

// Mock the Scanner base class
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

// Override module require to use our mock Scanner
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
        coinGeckoAPI: ''
      },
      FUNDUPDATEDELAY: 7
    };
  }
  return originalRequire.apply(this, arguments);
};

// Now load the FundUpdater
const FundUpdater = require('../core/FundUpdater');

async function testApiDetection() {
  console.log('🔍 Testing FundUpdater API Detection\n');
  console.log('='.repeat(80));
  
  // Create FundUpdater instance
  const updater = new FundUpdater();
  updater.network = 'ethereum';
  updater.currentTime = Math.floor(Date.now() / 1000);
  
  console.log(`\n📊 Initial State:`);
  console.log(`   API Key: ${updater.coinGeckoKey ? updater.coinGeckoKey.substring(0, 20) + '...' : 'None'}`);
  console.log(`   API Mode: ${updater.apiMode}`);
  console.log(`   Mode Detected: ${updater.apiModeDetected}`);
  
  // Test API detection
  console.log(`\n🚀 Running API Detection...`);
  await updater.detectApiMode();
  
  console.log(`\n✅ Detection Complete:`);
  console.log(`   API Mode: ${updater.apiMode}`);
  console.log(`   API Key Active: ${updater.coinGeckoKey ? 'Yes' : 'No (disabled)'}`);
  
  // Test actual API call
  console.log(`\n📈 Testing Price Fetch...`);
  try {
    const price = await updater.getNativeTokenPrice();
    if (price > 0) {
      console.log(`   ✅ ETH Price: $${price}`);
      console.log(`   API Mode Used: ${updater.apiMode}`);
    } else {
      console.log(`   ⚠️ No price returned`);
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📋 SUMMARY\n');
  
  if (updater.apiMode === 'free' && process.env.DEFAULT_COINGECKO_KEY) {
    console.log('🔴 API key is deactivated - system automatically switched to free tier');
    console.log('   - Free tier: 10-30 calls/minute');
    console.log('   - Using 6-second delays between calls');
    console.log('   - To restore full speed, reactivate your CoinGecko subscription');
  } else if (updater.apiMode === 'pro') {
    console.log('🟢 Pro API active and working');
    console.log('   - Higher rate limits available');
    console.log('   - Minimal delays between calls');
  } else if (updater.apiMode === 'demo') {
    console.log('🟡 Demo API active');
    console.log('   - 30 calls/minute, 10,000 calls/month');
    console.log('   - 2-second delays recommended');
  } else {
    console.log('⚪ Free API (no key)');
    console.log('   - 10-30 calls/minute');
    console.log('   - 6-second delays between calls');
  }
}

testApiDetection()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
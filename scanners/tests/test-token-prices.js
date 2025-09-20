#!/usr/bin/env node
/**
 * Test token price fetching with mixed mode
 */

require('dotenv').config();

// Mock dependencies
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
      CONFIG: { coinGeckoAPI: '' },
      FUNDUPDATEDELAY: 7
    };
  }
  return originalRequire.apply(this, arguments);
};

const FundUpdater = require('../core/FundUpdater');

async function testTokenPrices() {
  console.log('🔍 Testing Token Price Fetching\n');
  console.log('='.repeat(80));
  
  const updater = new FundUpdater();
  updater.currentTime = Math.floor(Date.now() / 1000);
  
  // Detect API mode first
  await updater.detectApiMode();
  console.log(`\nAPI Mode: ${updater.apiMode}\n`);
  
  const networks = [
    { 
      network: 'ethereum',
      tokens: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'], // USDC
      name: 'Ethereum USDC'
    },
    {
      network: 'binance',
      tokens: ['0x55d398326f99059ff775485246999027b3197955'], // USDT
      name: 'BSC USDT'
    },
    {
      network: 'polygon',
      tokens: ['0x2791bca1f2de4661ed88a30c99a7a9449aa84174'], // USDC
      name: 'Polygon USDC'
    }
  ];
  
  console.log('Testing Token Prices:\n');
  
  for (const netConfig of networks) {
    updater.network = netConfig.network;
    const platformId = updater.getCoinGeckoPlatformId();
    
    console.log(`📊 ${netConfig.network} (${platformId})`);
    console.log(`   Token: ${netConfig.name}`);
    
    try {
      const params = {
        contract_addresses: netConfig.tokens.join(','),
        vs_currencies: 'usd'
      };
      
      const { response, mode } = await updater.makeApiRequest(
        `/simple/token_price/${platformId}`,
        params
      );
      
      const prices = response.data;
      for (const [address, data] of Object.entries(prices)) {
        console.log(`   ✅ Price: $${data.usd} (${mode.toUpperCase()} API)`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.status || error.message}`);
      if (error.response?.data?.status?.error_message) {
        console.log(`   Message: ${error.response.data.status.error_message}`);
      }
    }
    
    // Wait between requests
    await updater.sleep(6000);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY\n');
  
  if (updater.apiMode === 'demo') {
    console.log('🟡 Using Demo API for native tokens');
    console.log('⚪ Using Free API for token prices (Demo doesn\'t support token endpoints)');
    console.log('\nRate Limits:');
    console.log('- Native tokens: 30 req/min (Demo)');
    console.log('- Token prices: 10-30 req/min (Free)');
    console.log('- Recommended delay: 6 seconds');
  }
}

testTokenPrices()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
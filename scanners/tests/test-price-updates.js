#!/usr/bin/env node
/**
 * Test price updates for different networks
 */

require('dotenv').config();
const { NETWORKS } = require('../config/networks');
const FundUpdater = require('../core/FundUpdater');

async function testPriceUpdates() {
  console.log('🔍 Testing Price Updates for All Networks\n');
  console.log('='.repeat(80));
  
  // Create temporary FundUpdater instance to access methods
  const updater = new FundUpdater();
  
  // Get CoinGecko platform mapping
  const getCoinGeckoPlatformId = (network) => {
    const platformMap = {
      'ethereum': 'ethereum',
      'binance': 'binance-smart-chain',
      'polygon': 'polygon-pos',
      'arbitrum': 'arbitrum-one',
      'optimism': 'optimistic-ethereum',
      'base': 'base',
      'avalanche': 'avalanche',
      'gnosis': 'xdai',
      'linea': 'linea',
      'scroll': 'scroll',
      'mantle': 'mantle',
      'opbnb': 'opbnb',
      'polygon-zkevm': 'polygon-zkevm',
      'arbitrum-nova': 'arbitrum-nova',
      'celo': 'celo',
      'cronos': 'cronos',
      'moonbeam': 'moonbeam',
      'moonriver': 'moonriver'
    };
    return platformMap[network] || null;
  };
  
  // Get native currency CoinGecko ID
  const getNativeCurrencyId = (nativeCurrency) => {
    const nativeCurrencyMap = {
      'ETH': 'ethereum',
      'BNB': 'binancecoin', 
      'MATIC': 'matic-network',
      'AVAX': 'avalanche-2',
      'FTM': 'fantom',
      'xDAI': 'xdai',
      'MOVR': 'moonriver',
      'GLMR': 'moonbeam',
      'CRO': 'crypto-com-chain',
      'CELO': 'celo',
      'MNT': 'mantle'
    };
    return nativeCurrencyMap[nativeCurrency] || null;
  };
  
  console.log('Network'.padEnd(20) + 'Native'.padEnd(10) + 'CoinGecko Platform'.padEnd(25) + 'Native Coin ID'.padEnd(20) + 'Status');
  console.log('-'.repeat(100));
  
  const issues = [];
  
  Object.entries(NETWORKS).forEach(([network, config]) => {
    const nativeCurrency = config.nativeCurrency || 'ETH';
    const platformId = getCoinGeckoPlatformId(network);
    const nativeCoinId = getNativeCurrencyId(nativeCurrency);
    
    let status = '✅';
    const problems = [];
    
    if (!platformId) {
      status = '❌';
      problems.push('No platform ID');
    }
    
    if (!nativeCoinId) {
      status = '⚠️';
      problems.push('No native coin ID');
    }
    
    if (status !== '✅') {
      issues.push({ network, nativeCurrency, problems });
    }
    
    console.log(
      network.padEnd(20) +
      nativeCurrency.padEnd(10) +
      (platformId || 'MISSING').padEnd(25) +
      (nativeCoinId || 'MISSING').padEnd(20) +
      status + (problems.length ? ' ' + problems.join(', ') : '')
    );
  });
  
  if (issues.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('❌ NETWORKS WITH MISSING CONFIGURATIONS:\n');
    
    issues.forEach(({ network, nativeCurrency, problems }) => {
      console.log(`${network} (${nativeCurrency}):`);
      problems.forEach(problem => console.log(`  - ${problem}`));
      console.log('');
    });
    
    console.log('🔧 FIXES NEEDED:\n');
    
    // Check for missing platform IDs
    const missingPlatforms = issues
      .filter(i => i.problems.includes('No platform ID'))
      .map(i => i.network);
    
    if (missingPlatforms.length > 0) {
      console.log('1. Add these networks to getCoinGeckoPlatformId():');
      missingPlatforms.forEach(network => {
        console.log(`   '${network}': '<coingecko-platform-id>',`);
      });
      console.log('');
    }
    
    // Check for missing native currency IDs
    const missingNativeCurrencies = issues
      .filter(i => i.problems.includes('No native coin ID'))
      .map(i => ({ network: i.network, currency: i.nativeCurrency }))
      .filter((v, i, a) => a.findIndex(x => x.currency === v.currency) === i); // unique
    
    if (missingNativeCurrencies.length > 0) {
      console.log('2. Add these native currencies to getNativeCurrencyId():');
      missingNativeCurrencies.forEach(({ currency }) => {
        console.log(`   '${currency}': '<coingecko-coin-id>',`);
      });
    }
  } else {
    console.log('\n✅ All networks have proper price update configurations!');
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY\n');
  console.log(`Total networks: ${Object.keys(NETWORKS).length}`);
  console.log(`Configured correctly: ${Object.keys(NETWORKS).length - issues.length}`);
  console.log(`Missing configurations: ${issues.length}`);
  
  if (issues.length > 0) {
    console.log('\n📝 CoinGecko API Resources:');
    console.log('- Platform list: https://api.coingecko.com/api/v3/asset_platforms');
    console.log('- Coin list: https://api.coingecko.com/api/v3/coins/list');
  }
}

testPriceUpdates()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
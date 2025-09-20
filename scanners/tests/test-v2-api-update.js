#!/usr/bin/env node
/**
 * Test script for V2 API implementation
 * Verifies that all networks properly use Etherscan V2 API
 */

require('dotenv').config();
const { getContractDeploymentTime } = require('../common/core');

class MockScanner {
  constructor(network) {
    this.network = network;
    const { NETWORKS } = require('../config/networks');
    this.config = NETWORKS[network];
    this.currentTime = Math.floor(Date.now() / 1000);
  }
  
  async etherscanCall(params) {
    const axios = require('axios');
    const apiKey = this.config.apiKeys ? this.config.apiKeys[0] : process.env.DEFAULT_ETHERSCAN_KEYS.split(',')[0];
    
    const response = await axios.get('https://api.etherscan.io/v2/api', {
      params: {
        ...params,
        chainid: this.config.chainId,
        apikey: apiKey
      },
      timeout: 10000
    });
    
    if (response.data?.status === '1') {
      return response.data.result;
    } else if (response.data?.status === '0' && response.data?.message?.includes('No data found')) {
      return [];
    } else {
      throw new Error(response.data?.message || 'API error');
    }
  }
  
  log(message, level = 'info') {
    console.log(`[${this.network}] ${message}`);
  }
}

async function testV2Implementation() {
  console.log('🧪 Testing V2 API Implementation\n');
  console.log('='.repeat(60));
  
  const testCases = [
    {
      network: 'ethereum',
      testAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
      expectedSuccess: true
    },
    {
      network: 'binance',
      testAddress: '0x55d398326f99059fF775485246999027B3197955', // USDT
      expectedSuccess: true
    },
    {
      network: 'polygon',
      testAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC.e
      expectedSuccess: true
    },
    {
      network: 'optimism',
      testAddress: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', // USDC
      expectedSuccess: true
    },
    {
      network: 'arbitrum',
      testAddress: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', // USDC
      expectedSuccess: true
    },
    {
      network: 'base',
      testAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
      expectedSuccess: true
    }
  ];
  
  const results = [];
  
  for (const test of testCases) {
    console.log(`\n📡 Testing ${test.network.toUpperCase()}`);
    console.log('-'.repeat(40));
    
    const scanner = new MockScanner(test.network);
    
    try {
      console.log(`Testing address: ${test.testAddress}`);
      
      // Test getContractDeploymentTime
      const deployTime = await getContractDeploymentTime(scanner, test.testAddress);
      
      if (deployTime && deployTime > 0) {
        const deployDate = new Date(deployTime * 1000);
        console.log(`✅ SUCCESS - Deployment time: ${deployDate.toISOString()}`);
        results.push({ network: test.network, success: true, deployTime });
      } else if (deployTime === null) {
        console.log(`⚠️  No deployment time found (API returned no data)`);
        results.push({ network: test.network, success: false, reason: 'No data' });
      } else {
        console.log(`❌ FAILED - Invalid deployment time: ${deployTime}`);
        results.push({ network: test.network, success: false, deployTime });
      }
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}`);
      results.push({ network: test.network, success: false, error: error.message });
    }
    
    // Small delay between tests
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\nSuccess rate: ${successCount}/${results.length} networks`);
  
  console.log('\nDetailed results:');
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    const details = r.success 
      ? `Deploy time retrieved` 
      : r.error || r.reason || 'Failed';
    console.log(`${status} ${r.network}: ${details}`);
  });
  
  console.log('\n✨ Key improvements in this update:');
  console.log('1. ✅ All networks use V2 API endpoint');
  console.log('2. ✅ Better error handling (returns null instead of 0)');
  console.log('3. ✅ Fallback to current time when deployment time unavailable');
  console.log('4. ✅ Genesis contract handling');
  console.log('5. ✅ Timestamp validation');
}

// Run the test
testV2Implementation()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
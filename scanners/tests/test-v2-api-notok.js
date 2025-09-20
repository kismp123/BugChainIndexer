#!/usr/bin/env node
/**
 * Comprehensive test to understand why V2 API returns NOTOK
 * and verify API key validity
 */

require('dotenv').config();
const axios = require('axios');

async function testAPIKey(apiKey) {
  console.log(`\n🔑 Testing API Key: ${apiKey.substring(0, 8)}...`);
  console.log('='.repeat(50));
  
  // Test 1: Basic API key validation
  try {
    const response = await axios.get('https://api.etherscan.io/api', {
      params: {
        module: 'stats',
        action: 'ethsupply',
        apikey: apiKey
      },
      timeout: 5000
    });
    
    if (response.data.status === '1') {
      console.log('✅ API key is valid (Ethereum mainnet test)');
      return true;
    } else {
      console.log(`❌ API key invalid: ${response.data.message}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ API key test failed: ${error.message}`);
    return false;
  }
}

async function testV2APIEndpoints() {
  const apiKeys = process.env.DEFAULT_ETHERSCAN_KEYS ? 
    process.env.DEFAULT_ETHERSCAN_KEYS.split(',').filter(Boolean) : [];
  
  if (apiKeys.length === 0) {
    console.error('❌ No API keys found in DEFAULT_ETHERSCAN_KEYS');
    return;
  }
  
  console.log(`Found ${apiKeys.length} API keys to test\n`);
  
  // First, validate all API keys
  console.log('📋 STEP 1: Validating API Keys');
  console.log('='.repeat(60));
  
  const validKeys = [];
  for (const key of apiKeys) {
    const isValid = await testAPIKey(key);
    if (isValid) validKeys.push(key);
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n✅ Valid keys: ${validKeys.length}/${apiKeys.length}`);
  
  if (validKeys.length === 0) {
    console.error('❌ No valid API keys found!');
    return;
  }
  
  const apiKey = validKeys[0];
  
  // Test V2 API with different scenarios
  console.log('\n📋 STEP 2: Testing V2 API Scenarios');
  console.log('='.repeat(60));
  
  const testScenarios = [
    {
      name: 'Valid Ethereum contract (USDC)',
      chainId: 1,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      expectSuccess: true
    },
    {
      name: 'Non-existent contract on Ethereum',
      chainId: 1,
      address: '0x0000000000000000000000000000000000000001',
      expectSuccess: false
    },
    {
      name: 'Valid BSC contract (BUSD)',
      chainId: 56,
      address: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
      expectSuccess: true
    },
    {
      name: 'Valid Polygon contract',
      chainId: 137,
      address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      expectSuccess: true
    },
    {
      name: 'Invalid chain ID',
      chainId: 99999,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      expectSuccess: false
    },
    {
      name: 'Malformed address',
      chainId: 1,
      address: 'invalid_address',
      expectSuccess: false
    }
  ];
  
  for (const scenario of testScenarios) {
    console.log(`\n🧪 ${scenario.name}`);
    console.log(`   Chain ID: ${scenario.chainId}, Address: ${scenario.address}`);
    
    try {
      const response = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          module: 'contract',
          action: 'getcontractcreation',
          contractaddresses: scenario.address,
          chainid: scenario.chainId,
          apikey: apiKey
        },
        timeout: 10000
      });
      
      const status = response.data.status;
      const message = response.data.message || '';
      const result = response.data.result;
      
      console.log(`   Status: ${status === '1' ? '✅ OK' : '❌ NOTOK'}`);
      if (message) console.log(`   Message: ${message}`);
      
      if (status === '1' && result && result.length > 0) {
        console.log(`   ✅ Found creation tx: ${result[0].txHash}`);
      } else if (status === '0') {
        // Analyze why NOTOK
        if (message.includes('No data found') || message.includes('No records found')) {
          console.log(`   ℹ️  Contract creation data not available (expected for EOA/non-contracts)`);
        } else if (message.includes('Invalid address')) {
          console.log(`   ⚠️  Invalid address format`);
        } else if (message.includes('Invalid chain')) {
          console.log(`   ⚠️  Invalid or unsupported chain ID`);
        } else if (message.includes('rate limit')) {
          console.log(`   ⚠️  Rate limit reached`);
        } else {
          console.log(`   ❓ Unknown NOTOK reason`);
        }
      }
      
      if (scenario.expectSuccess && status !== '1') {
        console.log(`   ⚠️  UNEXPECTED: Expected success but got NOTOK`);
      } else if (!scenario.expectSuccess && status === '1') {
        console.log(`   ⚠️  UNEXPECTED: Expected failure but got OK`);
      }
      
    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Test rate limits
  console.log('\n📋 STEP 3: Testing Rate Limits');
  console.log('='.repeat(60));
  
  console.log('Making 5 rapid requests to test rate limiting...');
  let successCount = 0;
  let rateLimitHit = false;
  
  for (let i = 0; i < 5; i++) {
    try {
      const response = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          module: 'proxy',
          action: 'eth_blockNumber',
          chainid: 1,
          apikey: apiKey
        },
        timeout: 5000
      });
      
      if (response.data.status === '1' || response.data.result) {
        successCount++;
        process.stdout.write('✓');
      } else if (response.data.message && response.data.message.includes('rate limit')) {
        rateLimitHit = true;
        process.stdout.write('⚠');
      } else {
        process.stdout.write('✗');
      }
    } catch (error) {
      process.stdout.write('✗');
    }
    
    // Very short delay
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\nSuccess: ${successCount}/5`);
  if (rateLimitHit) {
    console.log('⚠️  Rate limit detected - consider using multiple API keys or adding delays');
  }
  
  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 ANALYSIS SUMMARY');
  console.log('='.repeat(60));
  
  console.log('\n🔍 Common reasons for NOTOK in V2 API:');
  console.log('1. "No data found" - Contract creation data not indexed');
  console.log('   - Common for contracts deployed before Etherscan started indexing');
  console.log('   - Also occurs for EOA addresses (not contracts)');
  console.log('2. "Invalid address" - Malformed address format');
  console.log('3. "Invalid chain" - Chain ID not supported');
  console.log('4. "Rate limit" - Too many requests');
  console.log('5. API key issues - Invalid or expired key');
  
  console.log('\n✅ RECOMMENDATIONS:');
  console.log('1. Always check if address is actually a contract before querying');
  console.log('2. Handle "No data found" gracefully (not an error, just no data)');
  console.log('3. Use multiple API keys and rotate them');
  console.log('4. Add delays between requests to avoid rate limits');
  console.log('5. Fallback to first_seen timestamp when creation data unavailable');
}

// Run the test
testV2APIEndpoints()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
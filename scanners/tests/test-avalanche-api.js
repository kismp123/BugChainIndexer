/**
 * Test Avalanche API - Dedicated vs V2
 */

const axios = require('axios');

const API_KEY = '964G8PEYWFX6MXG8IW9JMBFM9TP4UTW6VI';
const AVALANCHE_CHAIN_ID = 43114;

const TEST_CONTRACTS = [
  {
    address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    name: 'USDC',
    description: 'USD Coin on Avalanche'
  },
  {
    address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    name: 'USDT',
    description: 'Tether USD on Avalanche'
  },
  {
    address: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
    name: 'WETH',
    description: 'Wrapped ETH on Avalanche'
  }
];

async function testDedicatedAPI(testData) {
  console.log('\n' + '-'.repeat(80));
  console.log('Testing Dedicated API: ' + testData.description);
  console.log('Address: ' + testData.address);
  console.log('-'.repeat(80));

  try {
    const response = await axios.get('https://api.snowtrace.io/api', {
      params: {
        module: 'contract',
        action: 'getsourcecode',
        address: testData.address,
        apikey: API_KEY
      },
      timeout: 15000
    });

    const data = response.data;
    console.log('Response status: ' + data.status);
    console.log('Response message: ' + data.message);

    if (!data || data.status !== '1') {
      console.log('❌ API Error: ' + (data.message || data.result));
      return { success: false, error: data.message || data.result, api: 'dedicated' };
    }

    const sourceData = data.result[0];
    if (!sourceData.SourceCode || sourceData.SourceCode === '') {
      console.log('⚠️  Contract not verified');
      return { success: false, error: 'Not verified', api: 'dedicated' };
    }

    console.log('✅ SUCCESS - ' + sourceData.ContractName);
    console.log('   Compiler: ' + sourceData.CompilerVersion);
    return {
      success: true,
      contractName: sourceData.ContractName,
      api: 'dedicated'
    };

  } catch (error) {
    console.log('❌ FAILED - ' + error.message);
    return { success: false, error: error.message, api: 'dedicated' };
  }
}

async function testV2API(testData) {
  console.log('\n' + '-'.repeat(80));
  console.log('Testing V2 API: ' + testData.description);
  console.log('Address: ' + testData.address);
  console.log('-'.repeat(80));

  try {
    const response = await axios.get('https://api.etherscan.io/v2/api', {
      params: {
        chainid: AVALANCHE_CHAIN_ID,
        module: 'contract',
        action: 'getsourcecode',
        address: testData.address,
        apikey: API_KEY
      },
      timeout: 15000
    });

    const data = response.data;
    console.log('Response status: ' + data.status);
    console.log('Response message: ' + data.message);

    if (!data || data.status !== '1') {
      console.log('❌ API Error: ' + (data.message || data.result));
      return { success: false, error: data.message || data.result, api: 'v2' };
    }

    const sourceData = data.result[0];
    if (!sourceData.SourceCode || sourceData.SourceCode === '') {
      console.log('⚠️  Contract not verified');
      return { success: false, error: 'Not verified', api: 'v2' };
    }

    console.log('✅ SUCCESS - ' + sourceData.ContractName);
    console.log('   Compiler: ' + sourceData.CompilerVersion);
    return {
      success: true,
      contractName: sourceData.ContractName,
      api: 'v2'
    };

  } catch (error) {
    console.log('❌ FAILED - ' + error.message);
    return { success: false, error: error.message, api: 'v2' };
  }
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('🧪 AVALANCHE - DEDICATED vs V2 API TEST');
  console.log('='.repeat(80));

  const dedicatedResults = [];
  const v2Results = [];

  // Test Dedicated API
  console.log('\n📊 TESTING DEDICATED API (api.snowtrace.io)');
  console.log('='.repeat(80));
  for (const contract of TEST_CONTRACTS) {
    const result = await testDedicatedAPI(contract);
    dedicatedResults.push(result);
    await new Promise(r => setTimeout(r, 1500));
  }

  // Test V2 API
  console.log('\n📊 TESTING V2 API (api.etherscan.io/v2/api?chainid=43114)');
  console.log('='.repeat(80));
  for (const contract of TEST_CONTRACTS) {
    const result = await testV2API(contract);
    v2Results.push(result);
    await new Promise(r => setTimeout(r, 1500));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPARISON RESULTS');
  console.log('='.repeat(80));

  const dedicatedSuccess = dedicatedResults.filter(r => r.success).length;
  const v2Success = v2Results.filter(r => r.success).length;

  console.log('\n✅ Dedicated API: ' + dedicatedSuccess + '/' + dedicatedResults.length);
  console.log('✅ V2 API:        ' + v2Success + '/' + v2Results.length);

  console.log('\n' + '-'.repeat(80));
  console.log('Contract-by-Contract:');
  console.log('-'.repeat(80));

  for (let i = 0; i < TEST_CONTRACTS.length; i++) {
    console.log('\n' + (i + 1) + '. ' + TEST_CONTRACTS[i].description);
    console.log('   Dedicated: ' + (dedicatedResults[i].success ? '✅ ' + dedicatedResults[i].contractName : '❌ ' + dedicatedResults[i].error));
    console.log('   V2:        ' + (v2Results[i].success ? '✅ ' + v2Results[i].contractName : '❌ ' + v2Results[i].error));
  }

  console.log('\n' + '='.repeat(80));
  console.log('💡 RECOMMENDATION');
  console.log('='.repeat(80));

  if (dedicatedSuccess > v2Success) {
    console.log('\n✅ USE DEDICATED API for Avalanche');
    console.log('   Better success rate: ' + dedicatedSuccess + '/' + dedicatedResults.length);
  } else if (v2Success > dedicatedSuccess) {
    console.log('\n✅ USE V2 API for Avalanche');
    console.log('   Better success rate: ' + v2Success + '/' + v2Results.length);
  } else if (dedicatedSuccess === v2Success && dedicatedSuccess > 0) {
    console.log('\n⚖️  BOTH APIs WORK EQUALLY');
    console.log('   Current dedicated API is fine, or switch to V2 for consistency');
  } else {
    console.log('\n❌ BOTH APIs FAILED');
  }

  console.log('\n' + '='.repeat(80));
}

runTests().catch(console.error);

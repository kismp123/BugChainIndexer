/**
 * Test Gnosis Network with V2 API
 *
 * Tests if Gnosis works with Etherscan v2 API instead of dedicated API
 */

require('dotenv').config();
const axios = require('axios');

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const GNOSIS_CHAIN_ID = 100;

// Test contracts
const TEST_CONTRACTS = [
  {
    address: '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb',
    name: 'GNO Token',
    description: 'GnosisDAO Token'
  },
  {
    address: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
    name: 'WXDAI',
    description: 'Wrapped XDAI'
  },
  {
    address: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
    name: 'USDC',
    description: 'USD Coin on Gnosis'
  }
];

async function testV2API(testData) {
  console.log('\n' + '-'.repeat(80));
  console.log(`Testing: ${testData.description}`);
  console.log(`Address: ${testData.address}`);
  console.log('-'.repeat(80));

  try {
    const response = await axios.get('https://api.etherscan.io/v2/api', {
      params: {
        chainid: GNOSIS_CHAIN_ID,
        module: 'contract',
        action: 'getsourcecode',
        address: testData.address,
        apikey: ETHERSCAN_API_KEY
      },
      timeout: 15000
    });

    const data = response.data;

    if (!data || data.status !== '1') {
      console.log(`❌ API Error: ${data.message || 'Unknown error'}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Result: ${data.result}`);
      return {
        address: testData.address,
        success: false,
        error: data.message || data.result,
        apiType: 'v2'
      };
    }

    const sourceData = data.result[0];

    if (!sourceData.SourceCode || sourceData.SourceCode === '') {
      console.log(`⚠️  Contract not verified`);
      return {
        address: testData.address,
        success: false,
        error: 'Not verified',
        apiType: 'v2'
      };
    }

    console.log(`✅ SUCCESS - Contract Verified via V2 API!`);
    console.log(`   Contract Name: ${sourceData.ContractName}`);
    console.log(`   Expected: ${testData.name}`);
    console.log(`   Compiler: ${sourceData.CompilerVersion}`);
    console.log(`   License: ${sourceData.LicenseType || 'None'}`);

    return {
      address: testData.address,
      success: true,
      contractName: sourceData.ContractName,
      expected: testData.name,
      verified: true,
      apiType: 'v2'
    };

  } catch (error) {
    console.log(`❌ FAILED - ${error.message}`);
    return {
      address: testData.address,
      success: false,
      error: error.message,
      apiType: 'v2'
    };
  }
}

async function testDedicatedAPI(testData) {
  console.log('\n' + '-'.repeat(80));
  console.log(`Testing Dedicated API: ${testData.description}`);
  console.log(`Address: ${testData.address}`);
  console.log('-'.repeat(80));

  try {
    const response = await axios.get('https://api.gnosisscan.io/api', {
      params: {
        module: 'contract',
        action: 'getsourcecode',
        address: testData.address,
        apikey: ETHERSCAN_API_KEY
      },
      timeout: 15000
    });

    const data = response.data;

    if (!data || data.status !== '1') {
      console.log(`❌ API Error: ${data.message || 'Unknown error'}`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Result: ${data.result}`);
      return {
        address: testData.address,
        success: false,
        error: data.message || data.result,
        apiType: 'dedicated'
      };
    }

    const sourceData = data.result[0];

    if (!sourceData.SourceCode || sourceData.SourceCode === '') {
      console.log(`⚠️  Contract not verified`);
      return {
        address: testData.address,
        success: false,
        error: 'Not verified',
        apiType: 'dedicated'
      };
    }

    console.log(`✅ SUCCESS - Contract Verified via Dedicated API!`);
    console.log(`   Contract Name: ${sourceData.ContractName}`);

    return {
      address: testData.address,
      success: true,
      contractName: sourceData.ContractName,
      verified: true,
      apiType: 'dedicated'
    };

  } catch (error) {
    console.log(`❌ FAILED - ${error.message}`);
    return {
      address: testData.address,
      success: false,
      error: error.message,
      apiType: 'dedicated'
    };
  }
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('🧪 GNOSIS - V2 API vs DEDICATED API COMPARISON');
  console.log('='.repeat(80));
  console.log('\nComparing Etherscan v2 API vs Gnosisscan Dedicated API...\n');

  const v2Results = [];
  const dedicatedResults = [];

  // Test V2 API
  console.log('\n' + '='.repeat(80));
  console.log('📊 TESTING V2 API (api.etherscan.io/v2/api?chainid=100)');
  console.log('='.repeat(80));

  for (const testData of TEST_CONTRACTS) {
    const result = await testV2API(testData);
    v2Results.push(result);
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Test Dedicated API
  console.log('\n' + '='.repeat(80));
  console.log('📊 TESTING DEDICATED API (api.gnosisscan.io/api)');
  console.log('='.repeat(80));

  for (const testData of TEST_CONTRACTS) {
    const result = await testDedicatedAPI(testData);
    dedicatedResults.push(result);
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPARISON RESULTS');
  console.log('='.repeat(80));

  const v2Success = v2Results.filter(r => r.success).length;
  const dedicatedSuccess = dedicatedResults.filter(r => r.success).length;

  console.log('\n✅ V2 API Results:');
  console.log(`   Success: ${v2Success}/${v2Results.length}`);
  console.log(`   Failed: ${v2Results.length - v2Success}/${v2Results.length}`);

  console.log('\n✅ Dedicated API Results:');
  console.log(`   Success: ${dedicatedSuccess}/${dedicatedResults.length}`);
  console.log(`   Failed: ${dedicatedResults.length - dedicatedSuccess}/${dedicatedResults.length}`);

  // Detailed comparison
  console.log('\n' + '-'.repeat(80));
  console.log('Contract-by-Contract Comparison:');
  console.log('-'.repeat(80));

  for (let i = 0; i < TEST_CONTRACTS.length; i++) {
    const contract = TEST_CONTRACTS[i];
    const v2 = v2Results[i];
    const dedicated = dedicatedResults[i];

    console.log(`\n${i + 1}. ${contract.description} (${contract.address})`);
    console.log(`   V2 API:        ${v2.success ? '✅ SUCCESS' : '❌ FAILED'} ${v2.success ? `(${v2.contractName})` : `(${v2.error})`}`);
    console.log(`   Dedicated API: ${dedicated.success ? '✅ SUCCESS' : '❌ FAILED'} ${dedicated.success ? `(${dedicated.contractName})` : `(${dedicated.error})`}`);
  }

  // Recommendation
  console.log('\n' + '='.repeat(80));
  console.log('💡 RECOMMENDATION');
  console.log('='.repeat(80));

  if (v2Success > dedicatedSuccess) {
    console.log('\n✅ USE V2 API for Gnosis!');
    console.log(`   V2 API works better (${v2Success}/${v2Results.length} vs ${dedicatedSuccess}/${dedicatedResults.length})`);
    console.log('\n   Configuration:');
    console.log('   gnosis: {');
    console.log('     chainId: 100,');
    console.log('     // Remove or comment out explorerApiUrl to use v2 API');
    console.log('     // explorerApiUrl: "https://api.gnosisscan.io/api",');
    console.log('   }');
  } else if (dedicatedSuccess > v2Success) {
    console.log('\n✅ USE DEDICATED API for Gnosis!');
    console.log(`   Dedicated API works better (${dedicatedSuccess}/${dedicatedResults.length} vs ${v2Success}/${v2Results.length})`);
    console.log('\n   Note: May require separate Gnosisscan API key');
  } else if (v2Success === 0 && dedicatedSuccess === 0) {
    console.log('\n❌ BOTH APIs FAILED!');
    console.log('   Possible issues:');
    console.log('   1. API key not working for Gnosis');
    console.log('   2. Test contracts not verified');
    console.log('   3. Network configuration issue');
  } else {
    console.log('\n⚖️  BOTH APIs WORK EQUALLY');
    console.log(`   Both: ${v2Success}/${v2Results.length} success`);
    console.log('   Recommend V2 API (simpler, single key)');
  }

  console.log('\n' + '='.repeat(80));

  return v2Success > 0 || dedicatedSuccess > 0;
}

// Run tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });

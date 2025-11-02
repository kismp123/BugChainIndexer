/**
 * Test: Avalanche Etherscan v2 API Support
 *
 * Tests whether Avalanche (43114) works with Etherscan v2 API
 */

require('dotenv').config();
const axios = require('axios');

const AVALANCHE_CHAINID = 43114;
const TEST_CONTRACT = '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7'; // USDT on Avalanche
const API_KEY = process.env.DEFAULT_ETHERSCAN_KEYS?.split(',')[0] || 'demo';

async function testEtherscanV2() {
  console.log('='.repeat(80));
  console.log('🧪 Testing Avalanche with Etherscan v2 API');
  console.log('='.repeat(80));

  console.log(`\n📋 Test Details:`);
  console.log(`   Chain ID: ${AVALANCHE_CHAINID}`);
  console.log(`   Contract: ${TEST_CONTRACT}`);
  console.log(`   API: Etherscan v2 (https://api.etherscan.io/v2/api)`);
  console.log('─'.repeat(80));

  try {
    console.log('\n🚀 Attempting Etherscan v2 API call...\n');

    const response = await axios.get('https://api.etherscan.io/v2/api', {
      params: {
        chainid: AVALANCHE_CHAINID,
        module: 'contract',
        action: 'getsourcecode',
        address: TEST_CONTRACT,
        apikey: API_KEY
      },
      timeout: 20000
    });

    console.log('Response status:', response.data?.status);
    console.log('Response message:', response.data?.message);

    if (response.data?.status === '1' && response.data?.result) {
      const sourceData = response.data.result[0];

      if (sourceData.SourceCode && sourceData.SourceCode !== '') {
        console.log('\n✅ SUCCESS: Avalanche works with Etherscan v2 API!\n');
        console.log('📊 Contract Information:');
        console.log(`   Contract Name: ${sourceData.ContractName || 'N/A'}`);
        console.log(`   Compiler: ${sourceData.CompilerVersion || 'N/A'}`);
        console.log(`   Verified: Yes`);
        console.log(`   Source Code Length: ${sourceData.SourceCode.length} characters`);

        return { success: true, usesV2: true };
      } else {
        console.log('\n⚠️  Contract not verified on Avalanche');
        return { success: false, reason: 'not_verified' };
      }
    } else {
      console.log('\n❌ FAILED: Etherscan v2 API does not support Avalanche');
      console.log('   Error:', response.data?.message || 'Unknown error');
      return { success: false, usesV2: false };
    }

  } catch (error) {
    console.log('\n❌ FAILED: Error calling Etherscan v2 API');
    console.log('   Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function testSnowtraceAPI() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 Testing Avalanche with Snowtrace API (dedicated)');
  console.log('='.repeat(80));

  console.log(`\n📋 Test Details:`);
  console.log(`   Contract: ${TEST_CONTRACT}`);
  console.log(`   API: Snowtrace (https://api.snowtrace.io/api)`);
  console.log('─'.repeat(80));

  try {
    console.log('\n🚀 Attempting Snowtrace API call...\n');

    const response = await axios.get('https://api.snowtrace.io/api', {
      params: {
        module: 'contract',
        action: 'getsourcecode',
        address: TEST_CONTRACT,
        apikey: API_KEY
      },
      timeout: 20000
    });

    console.log('Response status:', response.data?.status);
    console.log('Response message:', response.data?.message);

    if (response.data?.status === '1' && response.data?.result) {
      const sourceData = response.data.result[0];

      if (sourceData.SourceCode && sourceData.SourceCode !== '') {
        console.log('\n✅ SUCCESS: Snowtrace API works!\n');
        console.log('📊 Contract Information:');
        console.log(`   Contract Name: ${sourceData.ContractName || 'N/A'}`);
        console.log(`   Compiler: ${sourceData.CompilerVersion || 'N/A'}`);
        console.log(`   Verified: Yes`);

        return { success: true };
      } else {
        console.log('\n⚠️  Contract not verified');
        return { success: false, reason: 'not_verified' };
      }
    } else {
      console.log('\n❌ FAILED: Snowtrace API error');
      console.log('   Error:', response.data?.message || 'Unknown error');
      return { success: false };
    }

  } catch (error) {
    console.log('\n❌ FAILED: Error calling Snowtrace API');
    console.log('   Error:', error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  const v2Result = await testEtherscanV2();
  const snowtraceResult = await testSnowtraceAPI();

  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(80));

  console.log(`\nEtherscan v2 API: ${v2Result.success ? '✅ WORKS' : '❌ FAILED'}`);
  console.log(`Snowtrace API:    ${snowtraceResult.success ? '✅ WORKS' : '❌ FAILED'}`);

  console.log('\n💡 RECOMMENDATION:\n');

  if (v2Result.success && v2Result.usesV2) {
    console.log('   ✅ Avalanche CAN use Etherscan v2 API!');
    console.log('   → Update configuration to remove explorerApiUrl for Avalanche');
    console.log('   → This will enable single API key across more networks');
  } else if (snowtraceResult.success) {
    console.log('   ⚠️  Avalanche requires Snowtrace API (dedicated endpoint)');
    console.log('   → Keep current configuration with api.snowtrace.io/api');
    console.log('   → Etherscan v2 does not support Avalanche yet');
  } else {
    console.log('   ❌ Both APIs failed - check API key and network');
  }

  console.log('\n' + '='.repeat(80));

  return v2Result.success && v2Result.usesV2;
}

runTests()
  .then(canUseV2 => {
    process.exit(canUseV2 ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });

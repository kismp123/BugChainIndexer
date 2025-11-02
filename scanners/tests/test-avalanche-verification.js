/**
 * Test: Avalanche Network Source Code Verification
 *
 * Tests Avalanche network with updated v2 API configuration
 */

require('dotenv').config();
const { etherscanRequest } = require('../common/core');

async function testAvalancheVerification() {
  console.log('='.repeat(70));
  console.log('🔍 Testing Avalanche Network Source Code Verification (v2 API)');
  console.log('='.repeat(70));

  const testContract = '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7'; // USDT

  console.log(`\n📝 Test Contract: ${testContract}`);
  console.log(`   Network: Avalanche C-Chain`);
  console.log(`   Expected API: Etherscan v2 API (chainId: 43114)`);
  console.log('-'.repeat(70));

  try {
    console.log('\n🚀 Fetching contract source code...\n');

    const result = await etherscanRequest('avalanche', {
      module: 'contract',
      action: 'getsourcecode',
      address: testContract
    });

    if (!result || !Array.isArray(result) || result.length === 0) {
      console.error('❌ FAILED: Invalid API response');
      return false;
    }

    const sourceData = result[0];

    if (!sourceData.SourceCode || sourceData.SourceCode === '') {
      console.error('❌ FAILED: Source code not verified or not found');
      return false;
    }

    console.log('✅ SUCCESS: Contract source code retrieved!');
    console.log('\n📊 Contract Information:');
    console.log(`   Contract Name: ${sourceData.ContractName || 'N/A'}`);
    console.log(`   Compiler Version: ${sourceData.CompilerVersion || 'N/A'}`);
    console.log(`   Optimization: ${sourceData.OptimizationUsed === '1' ? 'Yes' : 'No'}`);
    console.log(`   Runs: ${sourceData.Runs || 'N/A'}`);
    console.log(`   EVM Version: ${sourceData.EVMVersion || 'default'}`);
    console.log(`   License: ${sourceData.LicenseType || 'N/A'}`);
    console.log(`   Proxy: ${sourceData.Proxy === '1' ? 'Yes' : 'No'}`);
    console.log(`   Source Code Length: ${sourceData.SourceCode.length} characters`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ Test Passed: Avalanche now uses Etherscan v2 API successfully!');
    console.log('='.repeat(70));

    return true;

  } catch (error) {
    console.error('\n❌ FAILED: Error during source code verification');
    console.error('   Error:', error.message);
    console.log('\n' + '='.repeat(70));
    console.log('❌ Test Failed');
    console.log('='.repeat(70));

    return false;
  }
}

testAvalancheVerification()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });

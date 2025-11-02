/**
 * Test: Scroll Network Source Code Verification
 *
 * This test verifies that Scroll network can properly fetch contract source code
 * using the correct Scrollscan API endpoint
 */

require('dotenv').config();
const { etherscanRequest } = require('../common/core');

async function testScrollVerification() {
  console.log('='.repeat(70));
  console.log('🔍 Testing Scroll Network Source Code Verification');
  console.log('='.repeat(70));

  // Test with a known verified contract on Scroll
  // Using Scroll's native bridge contract as an example
  const testContract = '0x781e90f1c8fc4611c9b7497c3b47f99ef6969cbc'; // Scroll Messenger

  console.log(`\n📝 Test Contract: ${testContract}`);
  console.log(`   Network: Scroll Mainnet`);
  console.log(`   Expected API: https://api.scrollscan.com/api`);
  console.log('-'.repeat(70));

  try {
    console.log('\n🚀 Fetching contract source code...\n');

    const result = await etherscanRequest('scroll', {
      module: 'contract',
      action: 'getsourcecode',
      address: testContract
    });

    if (!result || !Array.isArray(result) || result.length === 0) {
      console.error('❌ FAILED: Invalid API response');
      console.error('   Response:', result);
      return false;
    }

    const sourceData = result[0];

    if (!sourceData.SourceCode || sourceData.SourceCode === '') {
      console.error('❌ FAILED: Source code not verified or not found');
      console.error('   Response data:', JSON.stringify(sourceData, null, 2));
      return false;
    }

    // Success - display contract info
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

    if (sourceData.ABI) {
      try {
        const abi = JSON.parse(sourceData.ABI);
        console.log(`   ABI Functions: ${abi.filter(x => x.type === 'function').length}`);
      } catch (e) {
        console.log(`   ABI: Present but invalid JSON`);
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ Test Passed: Scroll network source code verification works!');
    console.log('='.repeat(70));

    return true;

  } catch (error) {
    console.error('\n❌ FAILED: Error during source code verification');
    console.error('   Error:', error.message);
    console.error('   Stack:', error.stack);
    console.log('\n' + '='.repeat(70));
    console.log('❌ Test Failed');
    console.log('='.repeat(70));

    return false;
  }
}

// Run test
testScrollVerification()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });

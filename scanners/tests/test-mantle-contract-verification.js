/**
 * Test Mantle Network Contract Verification
 *
 * Tests if Mantle network can retrieve contract names properly
 */

require('dotenv').config();
const { etherscanRequest } = require('../common/core');

// Test contracts on Mantle network
const MANTLE_TEST_CONTRACTS = [
  {
    address: '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8',
    name: 'Mantle Token',
    description: 'MNT Token - Native token'
  },
  {
    address: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE',
    name: 'USDT',
    description: 'Tether USD on Mantle'
  },
  {
    address: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9',
    name: 'USDC',
    description: 'USD Coin on Mantle'
  }
];

async function testMantleContract(testData) {
  console.log('\n' + '-'.repeat(80));
  console.log(`Testing: ${testData.description}`);
  console.log(`Address: ${testData.address}`);
  console.log('-'.repeat(80));

  try {
    const result = await etherscanRequest('mantle', {
      module: 'contract',
      action: 'getsourcecode',
      address: testData.address
    });

    if (!result || !Array.isArray(result) || result.length === 0) {
      console.log(`❌ Invalid API response`);
      return {
        address: testData.address,
        success: false,
        error: 'Invalid response'
      };
    }

    const sourceData = result[0];

    if (!sourceData.SourceCode || sourceData.SourceCode === '') {
      console.log(`⚠️  Contract not verified on explorer`);
      console.log(`   Expected: ${testData.name}`);
      return {
        address: testData.address,
        success: false,
        error: 'Not verified',
        expected: testData.name
      };
    }

    // Success - contract is verified
    console.log(`✅ Contract Verified`);
    console.log(`   Contract Name: ${sourceData.ContractName}`);
    console.log(`   Expected: ${testData.name}`);
    console.log(`   Compiler: ${sourceData.CompilerVersion}`);
    console.log(`   Optimization: ${sourceData.OptimizationUsed === '1' ? 'Yes' : 'No'}`);
    console.log(`   License: ${sourceData.LicenseType || 'None'}`);

    const nameMatches = sourceData.ContractName &&
                       (sourceData.ContractName.toLowerCase().includes(testData.name.toLowerCase()) ||
                        testData.name.toLowerCase().includes(sourceData.ContractName.toLowerCase()));

    if (nameMatches) {
      console.log(`   ✅ Name matches expected`);
    } else {
      console.log(`   ⚠️  Name differs from expected`);
    }

    return {
      address: testData.address,
      success: true,
      contractName: sourceData.ContractName,
      expected: testData.name,
      compiler: sourceData.CompilerVersion,
      verified: true,
      nameMatches
    };

  } catch (error) {
    console.log(`❌ FAILED - ${error.message}`);
    return {
      address: testData.address,
      success: false,
      error: error.message,
      expected: testData.name
    };
  }
}

async function testAllMantleContracts() {
  console.log('='.repeat(80));
  console.log('🧪 MANTLE NETWORK - CONTRACT VERIFICATION TEST');
  console.log('='.repeat(80));
  console.log('\nTesting if Mantle network can retrieve contract names...');
  console.log(`Using: Etherscan v2 API (chainid: 5000)\n`);

  const results = [];

  for (const testData of MANTLE_TEST_CONTRACTS) {
    const result = await testMantleContract(testData);
    results.push(result);

    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESULTS SUMMARY');
  console.log('='.repeat(80));

  const verified = results.filter(r => r.success && r.verified);
  const notVerified = results.filter(r => !r.success && r.error === 'Not verified');
  const failed = results.filter(r => !r.success && r.error !== 'Not verified');

  if (verified.length > 0) {
    console.log('\n✅ VERIFIED CONTRACTS:\n');
    verified.forEach(r => {
      const match = r.nameMatches ? '✓' : '⚠';
      console.log(`   ${match} ${r.address}`);
      console.log(`     Retrieved: ${r.contractName}`);
      console.log(`     Expected:  ${r.expected}`);
    });
  }

  if (notVerified.length > 0) {
    console.log('\n⚠️  NOT VERIFIED ON EXPLORER:\n');
    notVerified.forEach(r => {
      console.log(`   ○ ${r.address} - ${r.expected}`);
    });
  }

  if (failed.length > 0) {
    console.log('\n❌ FAILED:\n');
    failed.forEach(r => {
      console.log(`   ✗ ${r.address} - ${r.error}`);
    });
  }

  console.log('\n' + '-'.repeat(80));
  console.log(`Total: ${results.length} | Verified: ${verified.length} | Not Verified: ${notVerified.length} | Failed: ${failed.length}`);
  console.log('='.repeat(80));

  // Diagnosis
  console.log('\n' + '='.repeat(80));
  console.log('🔍 DIAGNOSIS');
  console.log('='.repeat(80));

  if (verified.length === 0 && notVerified.length > 0) {
    console.log('\n⚠️  ISSUE DETECTED: All test contracts are not verified');
    console.log('\nPossible causes:');
    console.log('   1. Test addresses may not be verified contracts');
    console.log('   2. Mantle uses v2 API - contracts may not be on Etherscan platform');
    console.log('   3. API endpoint may need different configuration');
    console.log('\n💡 Recommendation:');
    console.log('   • Find verified contracts on https://explorer.mantle.xyz');
    console.log('   • Test with known verified addresses');
  } else if (verified.length === 0 && failed.length > 0) {
    console.log('\n❌ ISSUE DETECTED: API calls failing');
    console.log('\nPossible causes:');
    console.log('   1. Mantle v2 API may not be working');
    console.log('   2. Rate limiting');
    console.log('   3. Network configuration issue');
    console.log('\n💡 Recommendation:');
    console.log('   • Check if Etherscan v2 API supports Mantle (chainid: 5000)');
    console.log('   • Verify network configuration in networks.js');
  } else if (verified.length > 0) {
    console.log('\n✅ VERIFICATION WORKING');
    console.log(`\n   ${verified.length}/${results.length} contracts successfully retrieved names`);

    const nameMatches = verified.filter(r => r.nameMatches).length;
    console.log(`   ${nameMatches}/${verified.length} names match expected values`);

    if (nameMatches < verified.length) {
      console.log('\n⚠️  Some contract names differ from expected');
      console.log('   This may be normal - contract names can vary from token names');
    }
  }

  console.log('\n' + '='.repeat(80));

  return verified.length > 0;
}

// Run test
testAllMantleContracts()
  .then(success => {
    console.log(success ? '\n✅ Mantle contract verification is working!\n' : '\n⚠️  Some issues detected\n');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Unexpected error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });

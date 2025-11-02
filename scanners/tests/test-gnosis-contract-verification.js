/**
 * Test Gnosis Network Contract Verification
 *
 * Tests if Gnosis network can retrieve contract names properly
 */

require('dotenv').config();
const { etherscanRequest } = require('../common/core');

// Test contracts on Gnosis network
const GNOSIS_TEST_CONTRACTS = [
  {
    address: '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb',
    name: 'GnosisDAO Token',
    description: 'GNO Token - Main token'
  },
  {
    address: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
    name: 'Wrapped XDAI',
    description: 'WXDAI - Wrapped native token'
  },
  {
    address: '0x6A023CCd1ff6F2045C3309768eAd9E68F978f6e1',
    name: 'Gnosis Safe',
    description: 'Popular multisig wallet'
  },
  {
    address: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
    name: 'USD Coin',
    description: 'USDC on Gnosis'
  },
  {
    address: '0x4ECaBa5870353805a9F068101A40E0f32ed605C6',
    name: 'Tether USD',
    description: 'USDT on Gnosis'
  }
];

async function testGnosisContract(testData) {
  console.log('\n' + '-'.repeat(80));
  console.log(`Testing: ${testData.description}`);
  console.log(`Address: ${testData.address}`);
  console.log('-'.repeat(80));

  try {
    const result = await etherscanRequest('gnosis', {
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

async function testAllGnosisContracts() {
  console.log('='.repeat(80));
  console.log('🧪 GNOSIS NETWORK - CONTRACT VERIFICATION TEST');
  console.log('='.repeat(80));
  console.log('\nTesting if Gnosis network can retrieve contract names...');
  console.log(`API Endpoint: https://api.gnosisscan.io/api\n`);

  const results = [];

  for (const testData of GNOSIS_TEST_CONTRACTS) {
    const result = await testGnosisContract(testData);
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
    console.log('\n⚠️  ISSUE DETECTED: All test contracts are not verified on Gnosisscan');
    console.log('\nPossible causes:');
    console.log('   1. Test addresses may not be verified contracts');
    console.log('   2. Gnosisscan may have different verified contracts');
    console.log('   3. API endpoint may need different configuration');
    console.log('\n💡 Recommendation:');
    console.log('   • Find verified contracts on https://gnosisscan.io');
    console.log('   • Test with known verified addresses');
  } else if (verified.length === 0 && failed.length > 0) {
    console.log('\n❌ ISSUE DETECTED: API calls failing');
    console.log('\nPossible causes:');
    console.log('   1. API key may not work for Gnosisscan');
    console.log('   2. Rate limiting');
    console.log('   3. Network configuration issue');
    console.log('\n💡 Recommendation:');
    console.log('   • Check if Etherscan API key works for Gnosisscan');
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
testAllGnosisContracts()
  .then(success => {
    console.log(success ? '\n✅ Gnosis contract verification is working!\n' : '\n⚠️  Some issues detected\n');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Unexpected error:', error.message);
    console.error(error.stack);
    process.exit(1);
  });

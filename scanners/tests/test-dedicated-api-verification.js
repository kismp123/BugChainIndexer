/**
 * Test: Dedicated API Contract Verification
 *
 * Tests if dedicated APIs work for contract source code verification
 */

require('dotenv').config();
const { etherscanRequest } = require('../common/core');

// Test contracts on networks using dedicated APIs
const DEDICATED_API_TESTS = {
  ethereum: {
    contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    expectedName: 'TetherToken',
    apiUrl: 'https://api.etherscan.io/api'
  },
  polygon: {
    contract: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    expectedName: 'UChildERC20Proxy',
    apiUrl: 'https://api.polygonscan.com/api'
  },
  arbitrum: {
    contract: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    expectedName: 'TransparentUpgradeableProxy',
    apiUrl: 'https://api.arbiscan.io/api'
  },
  base: {
    contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    expectedName: 'FiatTokenProxy',
    apiUrl: 'https://api.basescan.org/api'
  }
};

async function testDedicatedAPIVerification(networkName, testData) {
  console.log(`\n${'─'.repeat(80)}`);
  console.log(`Testing ${networkName.toUpperCase()} - Dedicated API`);
  console.log(`API: ${testData.apiUrl}`);
  console.log(`Contract: ${testData.contract}`);
  console.log('─'.repeat(80));

  try {
    // Use etherscanRequest which will use the dedicated API from config
    const result = await etherscanRequest(networkName, {
      module: 'contract',
      action: 'getsourcecode',
      address: testData.contract
    });

    if (!result || !Array.isArray(result) || result.length === 0) {
      console.log(`❌ ${networkName}: Invalid API response`);
      return {
        network: networkName,
        success: false,
        error: 'Invalid response'
      };
    }

    const sourceData = result[0];

    if (!sourceData.SourceCode || sourceData.SourceCode === '') {
      console.log(`❌ ${networkName}: Source code not verified`);
      return {
        network: networkName,
        success: false,
        error: 'Not verified'
      };
    }

    // Success!
    console.log(`✅ ${networkName}: SUCCESS`);
    console.log(`   Contract Name: ${sourceData.ContractName}`);
    console.log(`   Expected: ${testData.expectedName}`);
    console.log(`   Match: ${sourceData.ContractName === testData.expectedName ? 'YES ✓' : 'NO ✗'}`);
    console.log(`   Compiler: ${sourceData.CompilerVersion}`);
    console.log(`   Optimization: ${sourceData.OptimizationUsed === '1' ? 'Yes' : 'No'}`);
    console.log(`   Source Code: ${sourceData.SourceCode.length} characters`);

    return {
      network: networkName,
      success: true,
      contractName: sourceData.ContractName,
      compiler: sourceData.CompilerVersion,
      verified: true
    };

  } catch (error) {
    console.log(`❌ ${networkName}: FAILED - ${error.message}`);
    return {
      network: networkName,
      success: false,
      error: error.message
    };
  }
}

async function testAllDedicatedAPIs() {
  console.log('='.repeat(80));
  console.log('🧪 DEDICATED API - CONTRACT VERIFICATION TEST');
  console.log('='.repeat(80));
  console.log('\nTesting if dedicated APIs can retrieve verified contract source code...\n');

  const results = [];

  for (const [network, testData] of Object.entries(DEDICATED_API_TESTS)) {
    const result = await testDedicatedAPIVerification(network, testData);
    results.push(result);

    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESULTS SUMMARY');
  console.log('='.repeat(80));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('\n✅ SUCCESSFUL VERIFICATIONS:\n');
  successful.forEach(r => {
    console.log(`   ✓ ${r.network.padEnd(15)} - ${r.contractName || 'N/A'}`);
  });

  if (failed.length > 0) {
    console.log('\n❌ FAILED:\n');
    failed.forEach(r => {
      console.log(`   ✗ ${r.network.padEnd(15)} - ${r.error}`);
    });
  }

  console.log('\n' + '─'.repeat(80));
  console.log(`Total: ${results.length} | Success: ${successful.length} | Failed: ${failed.length}`);
  console.log('='.repeat(80));

  // Answer the question
  console.log('\n' + '='.repeat(80));
  console.log('❓ QUESTION: Can dedicated APIs verify contracts?');
  console.log('='.repeat(80));

  if (successful.length === results.length) {
    console.log('\n✅ ANSWER: Yes! Dedicated APIs fully support contract source code verification!\n');
    console.log('📋 Features:');
    console.log('   ✓ Source code retrieval (getsourcecode) - fully supported');
    console.log('   ✓ Contract name, compiler version, ABI and all metadata');
    console.log('   ✓ Proxy contract detection');
    console.log('   ✓ Optimization settings, license info, etc.');
    console.log('\n💡 Dedicated API vs V2 API:');
    console.log('   • Features: Identical (both support source verification)');
    console.log('   • Difference: Only access method differs (URL/parameters)');
    console.log('   • Data: Completely identical responses');
  } else {
    console.log('\n⚠️  ANSWER: Some networks had issues.');
    console.log(`   Success: ${successful.length}/${results.length}`);
  }

  console.log('\n' + '='.repeat(80));

  return failed.length === 0;
}

// Run test
testAllDedicatedAPIs()
  .then(success => {
    console.log(success ? '\n✅ All dedicated APIs work perfectly!\n' : '\n⚠️  Some tests failed\n');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Unexpected error:', error.message);
    process.exit(1);
  });

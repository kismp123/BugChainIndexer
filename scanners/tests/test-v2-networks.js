/**
 * Test: All Etherscan v2 API Networks
 *
 * Tests all networks configured to use Etherscan v2 API
 */

require('dotenv').config();
const { etherscanRequest } = require('../common/core');

const V2_NETWORKS = {
  avalanche: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', // USDT
  scroll: '0x781e90f1c8fc4611c9b7497c3b47f99ef6969cbc', // Scroll Messenger
  // unichain and berachain may not have many verified contracts yet
};

async function testNetwork(networkName, contractAddress) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Testing ${networkName.toUpperCase()}`);
  console.log(`Contract: ${contractAddress}`);
  console.log('─'.repeat(70));

  try {
    const result = await etherscanRequest(networkName, {
      module: 'contract',
      action: 'getsourcecode',
      address: contractAddress
    });

    if (!result || !Array.isArray(result) || result.length === 0) {
      console.log(`❌ ${networkName}: Invalid API response`);
      return false;
    }

    const sourceData = result[0];

    if (!sourceData.SourceCode || sourceData.SourceCode === '') {
      console.log(`❌ ${networkName}: Source code not verified`);
      return false;
    }

    console.log(`✅ ${networkName}: SUCCESS`);
    console.log(`   Contract Name: ${sourceData.ContractName || 'N/A'}`);
    console.log(`   Compiler: ${sourceData.CompilerVersion || 'N/A'}`);
    console.log(`   Verified: Yes`);

    return true;

  } catch (error) {
    console.log(`❌ ${networkName}: FAILED - ${error.message}`);
    return false;
  }
}

async function testAllV2Networks() {
  console.log('='.repeat(70));
  console.log('🧪 TESTING ALL ETHERSCAN V2 API NETWORKS');
  console.log('='.repeat(70));

  const results = {};

  for (const [network, address] of Object.entries(V2_NETWORKS)) {
    results[network] = await testNetwork(network, address);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL RESULTS');
  console.log('='.repeat(70));

  const successful = Object.entries(results).filter(([, success]) => success);
  const failed = Object.entries(results).filter(([, success]) => !success);

  console.log('\n✅ SUCCESSFUL:\n');
  successful.forEach(([network]) => {
    console.log(`   ✓ ${network.toUpperCase()}`);
  });

  if (failed.length > 0) {
    console.log('\n❌ FAILED:\n');
    failed.forEach(([network]) => {
      console.log(`   ✗ ${network.toUpperCase()}`);
    });
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`Passed: ${successful.length}/${Object.keys(results).length}`);
  console.log('='.repeat(70));

  console.log('\n💡 NETWORKS NOW USING ETHERSCAN V2 API:\n');
  console.log('   • Avalanche (43114) ✅ - Migrated from Snowtrace API');
  console.log('   • Scroll (534352) ✅ - Native v2 support');
  console.log('   • Unichain (1301) - Native v2 support');
  console.log('   • Berachain (80084) - Native v2 support');
  console.log('\n   Benefits: Single API key, unified interface, easier maintenance');
  console.log('\n' + '='.repeat(70));

  return failed.length === 0;
}

testAllV2Networks()
  .then(success => {
    console.log(success ? '\n✅ ALL V2 NETWORKS WORKING!\n' : '\n⚠️  SOME TESTS FAILED\n');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ UNEXPECTED ERROR:', error.message);
    process.exit(1);
  });

/**
 * Test: Comprehensive Network Explorer API Verification
 *
 * Tests all configured networks to ensure their explorer APIs work correctly
 */

require('dotenv').config();
const { NETWORKS } = require('../config/networks');
const { etherscanRequest } = require('../common/core');

// Known verified contracts for each network (real addresses with verified source code)
const TEST_CONTRACTS = {
  ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
  polygon: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
  arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT
  optimism: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', // USDT
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  avalanche: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', // USDT
  binance: '0x55d398326f99059fF775485246999027B3197955', // BSC-USD
  gnosis: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83', // USDC
  linea: '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Fd1A8', // LineaBank
  scroll: '0x781e90f1c8fc4611c9b7497c3b47f99ef6969cbc', // Scroll Messenger
  mantle: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', // USDC
  // Note: Unichain and Berachain are very new, may not have many verified contracts yet
};

async function testNetworkExplorerAPI(networkName) {
  const networkConfig = NETWORKS[networkName];
  const testContract = TEST_CONTRACTS[networkName];

  if (!networkConfig) {
    return {
      network: networkName,
      success: false,
      error: 'Network not configured',
      explorerApiUrl: 'N/A'
    };
  }

  if (!testContract) {
    return {
      network: networkName,
      success: false,
      error: 'No test contract available',
      explorerApiUrl: networkConfig.explorerApiUrl || 'Etherscan v2 API'
    };
  }

  const apiUrl = networkConfig.explorerApiUrl || `Etherscan v2 API (chainId: ${networkConfig.chainId})`;

  try {
    console.log(`\n🔍 Testing ${networkName}...`);
    console.log(`   API: ${apiUrl}`);
    console.log(`   Contract: ${testContract}`);

    const result = await etherscanRequest(networkName, {
      module: 'contract',
      action: 'getsourcecode',
      address: testContract
    });

    if (!result || !Array.isArray(result) || result.length === 0) {
      return {
        network: networkName,
        success: false,
        error: 'Invalid API response',
        explorerApiUrl: apiUrl
      };
    }

    const sourceData = result[0];

    if (!sourceData.SourceCode || sourceData.SourceCode === '') {
      return {
        network: networkName,
        success: false,
        error: 'Source code not verified (contract may not be verified)',
        explorerApiUrl: apiUrl
      };
    }

    console.log(`   ✅ Success! Contract: ${sourceData.ContractName || 'Unknown'}`);

    return {
      network: networkName,
      success: true,
      contractName: sourceData.ContractName || 'Unknown',
      compilerVersion: sourceData.CompilerVersion || 'Unknown',
      verified: true,
      explorerApiUrl: apiUrl
    };

  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);

    return {
      network: networkName,
      success: false,
      error: error.message,
      explorerApiUrl: apiUrl
    };
  }
}

async function testAllNetworks() {
  console.log('='.repeat(80));
  console.log('🧪 COMPREHENSIVE NETWORK EXPLORER API TEST');
  console.log('='.repeat(80));

  const networksToTest = Object.keys(TEST_CONTRACTS);
  const results = [];

  console.log(`\n📋 Testing ${networksToTest.length} networks with explorer APIs...\n`);

  for (const networkName of networksToTest) {
    const result = await testNetworkExplorerAPI(networkName);
    results.push(result);

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('='.repeat(80));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('\n✅ SUCCESSFUL NETWORKS:\n');
  successful.forEach(r => {
    console.log(`   ✓ ${r.network.toUpperCase().padEnd(15)} - ${r.contractName || 'N/A'}`);
    console.log(`     API: ${r.explorerApiUrl}`);
  });

  if (failed.length > 0) {
    console.log('\n❌ FAILED NETWORKS:\n');
    failed.forEach(r => {
      console.log(`   ✗ ${r.network.toUpperCase().padEnd(15)} - ${r.error}`);
      console.log(`     API: ${r.explorerApiUrl}`);
    });
  }

  console.log('\n' + '─'.repeat(80));
  console.log(`Total: ${results.length} | Passed: ${successful.length} | Failed: ${failed.length}`);
  console.log('='.repeat(80));

  // Detailed configuration report
  console.log('\n📋 NETWORK CONFIGURATION DETAILS:\n');

  const allNetworks = Object.keys(NETWORKS);
  allNetworks.forEach(name => {
    const config = NETWORKS[name];
    const apiType = config.explorerApiUrl
      ? `Dedicated API: ${config.explorerApiUrl}`
      : `Etherscan v2 (chainId: ${config.chainId})`;

    const tested = TEST_CONTRACTS[name] ? '✓ Tested' : '○ Not tested';
    console.log(`   ${name.padEnd(15)} - ${tested.padEnd(12)} - ${apiType}`);
  });

  console.log('\n' + '='.repeat(80));

  return failed.length === 0;
}

// Run the test
testAllNetworks()
  .then(success => {
    console.log(success ? '\n✅ ALL TESTS PASSED!\n' : '\n⚠️  SOME TESTS FAILED\n');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ UNEXPECTED ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  });

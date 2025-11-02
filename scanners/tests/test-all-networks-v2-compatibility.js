/**
 * Test: All Networks Etherscan v2 API Compatibility
 *
 * Tests whether all EVM networks can use Etherscan v2 API
 */

require('dotenv').config();
const axios = require('axios');
const { NETWORKS } = require('../config/networks');

const API_KEY = process.env.DEFAULT_ETHERSCAN_KEYS?.split(',')[0] || 'demo';

// Known verified contracts for each network
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
};

async function testNetworkWithV2API(networkName) {
  const networkConfig = NETWORKS[networkName];
  const testContract = TEST_CONTRACTS[networkName];

  if (!networkConfig) {
    return {
      network: networkName,
      tested: false,
      reason: 'Network not configured'
    };
  }

  if (networkConfig.chainType === 'move') {
    return {
      network: networkName,
      tested: false,
      reason: 'Non-EVM blockchain (Move)'
    };
  }

  if (!testContract) {
    return {
      network: networkName,
      tested: false,
      reason: 'No test contract available'
    };
  }

  const chainId = networkConfig.chainId;

  console.log(`\n${'─'.repeat(80)}`);
  console.log(`Testing ${networkName.toUpperCase()} with Etherscan v2 API`);
  console.log(`ChainID: ${chainId} | Contract: ${testContract}`);
  console.log('─'.repeat(80));

  try {
    const response = await axios.get('https://api.etherscan.io/v2/api', {
      params: {
        chainid: chainId,
        module: 'contract',
        action: 'getsourcecode',
        address: testContract,
        apikey: API_KEY
      },
      timeout: 20000
    });

    if (response.data?.status === '1' && response.data?.result) {
      const sourceData = response.data.result[0];

      if (sourceData.SourceCode && sourceData.SourceCode !== '') {
        console.log(`✅ SUCCESS: ${networkName}`);
        console.log(`   Contract: ${sourceData.ContractName || 'Unknown'}`);
        console.log(`   Compiler: ${sourceData.CompilerVersion || 'Unknown'}`);

        return {
          network: networkName,
          chainId: chainId,
          tested: true,
          v2Compatible: true,
          contractName: sourceData.ContractName,
          currentlyUsing: !networkConfig.explorerApiUrl ? 'v2' : 'dedicated'
        };
      } else {
        console.log(`⚠️  ${networkName}: Contract not verified`);
        return {
          network: networkName,
          chainId: chainId,
          tested: true,
          v2Compatible: true,
          verified: false
        };
      }
    } else {
      const message = response.data?.message || 'Unknown error';
      console.log(`❌ FAILED: ${networkName}`);
      console.log(`   Error: ${message}`);

      return {
        network: networkName,
        chainId: chainId,
        tested: true,
        v2Compatible: false,
        error: message,
        currentlyUsing: networkConfig.explorerApiUrl ? 'dedicated' : 'v2'
      };
    }

  } catch (error) {
    console.log(`❌ ERROR: ${networkName}`);
    console.log(`   ${error.message}`);

    return {
      network: networkName,
      chainId: chainId,
      tested: true,
      v2Compatible: false,
      error: error.message,
      currentlyUsing: networkConfig.explorerApiUrl ? 'dedicated' : 'v2'
    };
  }
}

async function testAllNetworks() {
  console.log('='.repeat(80));
  console.log('🧪 COMPREHENSIVE ETHERSCAN V2 API COMPATIBILITY TEST');
  console.log('='.repeat(80));
  console.log('\nTesting ALL networks to see if they can use Etherscan v2 API...\n');

  const networksToTest = Object.keys(TEST_CONTRACTS);
  const results = [];

  for (const networkName of networksToTest) {
    const result = await testNetworkWithV2API(networkName);
    results.push(result);

    // Delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 V2 API COMPATIBILITY RESULTS');
  console.log('='.repeat(80));

  const v2Compatible = results.filter(r => r.tested && r.v2Compatible);
  const notCompatible = results.filter(r => r.tested && !r.v2Compatible);
  const notTested = results.filter(r => !r.tested);

  console.log('\n✅ V2 API COMPATIBLE NETWORKS:\n');
  v2Compatible.forEach(r => {
    const current = r.currentlyUsing === 'v2' ? '(using v2)' : '(using dedicated)';
    console.log(`   ✓ ${r.network.padEnd(15)} ChainID: ${String(r.chainId).padEnd(8)} ${current}`);
    if (r.contractName) {
      console.log(`     Contract verified: ${r.contractName}`);
    }
  });

  if (notCompatible.length > 0) {
    console.log('\n❌ NOT V2 COMPATIBLE:\n');
    notCompatible.forEach(r => {
      console.log(`   ✗ ${r.network.padEnd(15)} ChainID: ${String(r.chainId).padEnd(8)}`);
      console.log(`     Error: ${r.error || 'Unknown'}`);
    });
  }

  if (notTested.length > 0) {
    console.log('\n○ NOT TESTED:\n');
    notTested.forEach(r => {
      console.log(`   ○ ${r.network.padEnd(15)} Reason: ${r.reason}`);
    });
  }

  // Recommendations
  console.log('\n' + '='.repeat(80));
  console.log('💡 RECOMMENDATIONS');
  console.log('='.repeat(80));

  const canMigrateToV2 = v2Compatible.filter(r => r.currentlyUsing === 'dedicated');
  const alreadyUsingV2 = v2Compatible.filter(r => r.currentlyUsing === 'v2');

  console.log('\n✅ Already using V2 API (optimal):');
  if (alreadyUsingV2.length === 0) {
    console.log('   (none)');
  } else {
    alreadyUsingV2.forEach(r => {
      console.log(`   • ${r.network} (${r.chainId})`);
    });
  }

  console.log('\n🔄 Can migrate to V2 API:');
  if (canMigrateToV2.length === 0) {
    console.log('   (none)');
  } else {
    canMigrateToV2.forEach(r => {
      const benefit = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'].includes(r.network)
        ? '← Major network, migration optional'
        : '← Could simplify configuration';
      console.log(`   • ${r.network} (${r.chainId}) ${benefit}`);
    });
  }

  console.log('\n❌ Must keep dedicated API:');
  if (notCompatible.length === 0) {
    console.log('   (none - all networks support v2!)');
  } else {
    notCompatible.forEach(r => {
      console.log(`   • ${r.network} (${r.chainId})`);
    });
  }

  // Statistics
  console.log('\n' + '='.repeat(80));
  console.log('📈 STATISTICS');
  console.log('─'.repeat(80));
  console.log(`   Total networks tested:     ${results.filter(r => r.tested).length}`);
  console.log(`   V2 Compatible:             ${v2Compatible.length} ✅`);
  console.log(`   Not compatible:            ${notCompatible.length} ${notCompatible.length === 0 ? '✅' : '❌'}`);
  console.log(`   Currently using V2:        ${alreadyUsingV2.length}`);
  console.log(`   Could migrate to V2:       ${canMigrateToV2.length}`);
  console.log('='.repeat(80));

  if (notCompatible.length === 0 && v2Compatible.length > 0) {
    console.log('\n🎉 EXCELLENT! All tested networks are V2 API compatible!');
    console.log('   You can unify more networks under a single API key if desired.');
  }

  console.log('\n');

  return {
    v2Compatible,
    notCompatible,
    canMigrateToV2
  };
}

// Run test
testAllNetworks()
  .then(result => {
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ UNEXPECTED ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  });

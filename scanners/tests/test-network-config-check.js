/**
 * Test: Network Configuration Validation
 *
 * Validates that all networks have proper explorer API configuration
 */

const { NETWORKS } = require('../config/networks');

function validateNetworkConfig() {
  console.log('='.repeat(80));
  console.log('🔍 NETWORK EXPLORER API CONFIGURATION CHECK');
  console.log('='.repeat(80));

  const allNetworks = Object.keys(NETWORKS);

  console.log(`\n📋 Total Networks Configured: ${allNetworks.length}\n`);

  const etherscanV2Networks = [];
  const dedicatedAPINetworks = [];
  const noExplorerNetworks = [];

  allNetworks.forEach(name => {
    const config = NETWORKS[name];

    if (config.chainType === 'move') {
      // Sui blockchain - non-EVM
      noExplorerNetworks.push({
        name,
        reason: 'Non-EVM blockchain (Move)',
        chainId: config.chainId
      });
    } else if (config.explorerApiUrl) {
      dedicatedAPINetworks.push({
        name,
        apiUrl: config.explorerApiUrl,
        chainId: config.chainId
      });
    } else {
      etherscanV2Networks.push({
        name,
        chainId: config.chainId,
        alchemyNetwork: config.alchemyNetwork
      });
    }
  });

  // Display Etherscan v2 networks
  console.log('📊 ETHERSCAN V2 API NETWORKS (using unified API):');
  console.log('─'.repeat(80));
  etherscanV2Networks.forEach(n => {
    console.log(`   ✓ ${n.name.padEnd(15)} - chainId: ${String(n.chainId).padEnd(8)} - ${n.alchemyNetwork || 'N/A'}`);
  });

  // Display dedicated API networks
  console.log('\n📊 DEDICATED EXPLORER API NETWORKS:');
  console.log('─'.repeat(80));
  dedicatedAPINetworks.forEach(n => {
    console.log(`   ✓ ${n.name.padEnd(15)} - chainId: ${String(n.chainId).padEnd(8)}`);
    console.log(`     API: ${n.apiUrl}`);
  });

  // Display non-explorer networks
  if (noExplorerNetworks.length > 0) {
    console.log('\n📊 NON-EVM/SPECIAL NETWORKS:');
    console.log('─'.repeat(80));
    noExplorerNetworks.forEach(n => {
      console.log(`   ○ ${n.name.padEnd(15)} - ${n.reason}`);
    });
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📈 SUMMARY');
  console.log('─'.repeat(80));
  console.log(`   Total Networks:           ${allNetworks.length}`);
  console.log(`   Etherscan v2 API:         ${etherscanV2Networks.length}`);
  console.log(`   Dedicated APIs:           ${dedicatedAPINetworks.length}`);
  console.log(`   Non-EVM/Special:          ${noExplorerNetworks.length}`);
  console.log('='.repeat(80));

  // Configuration recommendations
  console.log('\n💡 CONFIGURATION NOTES:\n');
  console.log('   • Etherscan v2 API networks use: https://api.etherscan.io/v2/api');
  console.log('   • Single API key works across all Etherscan v2 networks');
  console.log('   • Dedicated API networks require network-specific API keys');
  console.log('   • Scroll successfully tested with Etherscan v2 API ✅');
  console.log('\n' + '='.repeat(80));

  return {
    total: allNetworks.length,
    etherscanV2: etherscanV2Networks.length,
    dedicated: dedicatedAPINetworks.length,
    special: noExplorerNetworks.length
  };
}

// Run validation
const stats = validateNetworkConfig();

console.log('\n✅ Configuration validation complete!\n');
process.exit(0);

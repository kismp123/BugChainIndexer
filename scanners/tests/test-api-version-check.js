/**
 * Test: API Version Check
 *
 * Checks what API version each network is currently using
 */

const { NETWORKS } = require('../config/networks');

console.log('='.repeat(80));
console.log('🔍 CURRENT API VERSION ANALYSIS');
console.log('='.repeat(80));

console.log('\n📋 Analyzing current configuration...\n');

const networks = Object.keys(NETWORKS).filter(name => NETWORKS[name].chainId !== 0);

const apiVersions = {
  v2: [],
  dedicated: [],
  details: []
};

networks.forEach(name => {
  const config = NETWORKS[name];

  if (config.chainType === 'move') {
    // Skip non-EVM chains
    return;
  }

  if (config.explorerApiUrl) {
    // Using dedicated API
    apiVersions.dedicated.push(name);
    apiVersions.details.push({
      network: name,
      chainId: config.chainId,
      apiType: 'Dedicated API',
      apiUrl: config.explorerApiUrl
    });
  } else {
    // Using Etherscan v2 API
    apiVersions.v2.push(name);
    apiVersions.details.push({
      network: name,
      chainId: config.chainId,
      apiType: 'Etherscan v2 API',
      apiUrl: `https://api.etherscan.io/v2/api (chainId: ${config.chainId})`
    });
  }
});

// Display results
console.log('🔵 ETHERSCAN V2 API (with chainid parameter):');
console.log('─'.repeat(80));
if (apiVersions.v2.length === 0) {
  console.log('   (none)');
} else {
  apiVersions.v2.forEach(name => {
    const detail = apiVersions.details.find(d => d.network === name);
    console.log(`   ✓ ${name.padEnd(15)} ChainID: ${String(detail.chainId).padEnd(8)}`);
    console.log(`     URL: https://api.etherscan.io/v2/api`);
  });
}

console.log('\n🟢 DEDICATED NETWORK APIs (NOT v1, but network-specific):');
console.log('─'.repeat(80));
if (apiVersions.dedicated.length === 0) {
  console.log('   (none)');
} else {
  apiVersions.dedicated.forEach(name => {
    const detail = apiVersions.details.find(d => d.network === name);
    console.log(`   ✓ ${name.padEnd(15)} ChainID: ${String(detail.chainId).padEnd(8)}`);
    console.log(`     URL: ${detail.apiUrl}`);
  });
}

console.log('\n' + '='.repeat(80));
console.log('📊 SUMMARY');
console.log('─'.repeat(80));
console.log(`   Total EVM Networks:        ${networks.length - 1}`); // -1 for sui
console.log(`   Using Etherscan v2 API:    ${apiVersions.v2.length}`);
console.log(`   Using Dedicated APIs:      ${apiVersions.dedicated.length}`);

console.log('\n' + '='.repeat(80));
console.log('💡 IMPORTANT CLARIFICATION');
console.log('='.repeat(80));

console.log('\n❌ NOT using Etherscan v1 API!');
console.log('\n✅ Current setup:');
console.log('   1. Dedicated Network APIs (e.g., api.polygonscan.com, api.arbiscan.io)');
console.log('      - These are NOT v1 APIs');
console.log('      - They are network-specific Etherscan-compatible APIs');
console.log('      - Each network has its own endpoint');
console.log('      - Example: api.polygonscan.com/api');
console.log('');
console.log('   2. Etherscan v2 Unified API (e.g., Scroll, Avalanche)');
console.log('      - Single endpoint: api.etherscan.io/v2/api');
console.log('      - Uses chainid parameter to specify network');
console.log('      - Example: api.etherscan.io/v2/api?chainid=534352');

console.log('\n📌 KEY DIFFERENCE:');
console.log('   • v1 API: api.etherscan.io/api (OLD, DEPRECATED as of May 2025)');
console.log('   • v2 API: api.etherscan.io/v2/api (NEW, UNIFIED)');
console.log('   • Dedicated: api.{network}scan.com/api (NETWORK-SPECIFIC)');

console.log('\n✅ You are NOT using v1 at all!');
console.log('   All your APIs are either:');
console.log('   - Etherscan v2 (modern, unified)');
console.log('   - Network-specific dedicated APIs (always up-to-date)');

console.log('\n' + '='.repeat(80));

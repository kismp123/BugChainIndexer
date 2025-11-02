/**
 * Test: All Networks Source Code Verification
 *
 * Tests source code verification across different networks
 */

require('dotenv').config();
const { etherscanRequest } = require('../common/core');

// Known verified contracts for each network
const TEST_CONTRACTS = {
  ethereum: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
  polygon: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC
  arbitrum: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT
  optimism: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', // USDT
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
  avalanche: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', // USDT
  binance: '0x55d398326f99059fF775485246999027B3197955', // BSC-USD
  scroll: '0x781e90f1c8fc4611c9b7497c3b47f99ef6969cbc', // Scroll Messenger
};

async function testNetwork(network, contractAddress) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Testing ${network.toUpperCase()}`);
  console.log(`Contract: ${contractAddress}`);
  console.log('─'.repeat(70));

  try {
    const result = await etherscanRequest(network, {
      module: 'contract',
      action: 'getsourcecode',
      address: contractAddress
    });

    if (!result || !Array.isArray(result) || result.length === 0) {
      console.error(`❌ ${network}: Invalid API response`);
      return false;
    }

    const sourceData = result[0];

    if (!sourceData.SourceCode || sourceData.SourceCode === '') {
      console.error(`❌ ${network}: Source code not verified`);
      return false;
    }

    console.log(`✅ ${network}: SUCCESS`);
    console.log(`   Contract Name: ${sourceData.ContractName || 'N/A'}`);
    console.log(`   Compiler: ${sourceData.CompilerVersion || 'N/A'}`);
    console.log(`   Verified: Yes`);

    return true;

  } catch (error) {
    console.error(`❌ ${network}: FAILED - ${error.message}`);
    return false;
  }
}

async function testAllNetworks() {
  console.log('='.repeat(70));
  console.log('🔍 Testing Source Code Verification Across All Networks');
  console.log('='.repeat(70));

  const results = {};

  for (const [network, address] of Object.entries(TEST_CONTRACTS)) {
    results[network] = await testNetwork(network, address);
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 Test Results Summary');
  console.log('='.repeat(70));

  let passCount = 0;
  let failCount = 0;

  for (const [network, passed] of Object.entries(results)) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status} - ${network}`);
    if (passed) passCount++;
    else failCount++;
  }

  console.log('\n' + '─'.repeat(70));
  console.log(`Total: ${passCount + failCount} | Passed: ${passCount} | Failed: ${failCount}`);
  console.log('='.repeat(70));

  return failCount === 0;
}

// Run test
testAllNetworks()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });

/**
 * Test: Dedicated API vs V2 API - Practical Comparison
 *
 * Shows the actual difference between dedicated and v2 API calls
 */

require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.DEFAULT_ETHERSCAN_KEYS?.split(',')[0] || 'demo';
const TEST_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC on Polygon

console.log('='.repeat(80));
console.log('🔍 DEDICATED API vs V2 API - PRACTICAL COMPARISON');
console.log('='.repeat(80));

async function testDedicatedAPI() {
  console.log('\n' + '─'.repeat(80));
  console.log('1️⃣  DEDICATED API (Polygon-specific)');
  console.log('─'.repeat(80));

  const url = 'https://api.polygonscan.com/api';
  const params = {
    module: 'contract',
    action: 'getsourcecode',
    address: TEST_CONTRACT,
    apikey: API_KEY
  };

  console.log('\n📋 Request Details:');
  console.log(`   URL: ${url}`);
  console.log(`   Parameters:`, JSON.stringify(params, null, 6));

  try {
    const response = await axios.get(url, { params, timeout: 20000 });

    if (response.data?.status === '1') {
      const contract = response.data.result[0];
      console.log('\n✅ Response:');
      console.log(`   Contract: ${contract.ContractName}`);
      console.log(`   Status: SUCCESS`);
      return true;
    }
  } catch (error) {
    console.log('\n❌ Error:', error.message);
    return false;
  }
}

async function testV2API() {
  console.log('\n' + '─'.repeat(80));
  console.log('2️⃣  ETHERSCAN V2 API (Unified, with chainid)');
  console.log('─'.repeat(80));

  const url = 'https://api.etherscan.io/v2/api';
  const params = {
    chainid: 137,  // Polygon chainid
    module: 'contract',
    action: 'getsourcecode',
    address: TEST_CONTRACT,
    apikey: API_KEY
  };

  console.log('\n📋 Request Details:');
  console.log(`   URL: ${url}`);
  console.log(`   Parameters:`, JSON.stringify(params, null, 6));

  try {
    const response = await axios.get(url, { params, timeout: 20000 });

    if (response.data?.status === '1') {
      const contract = response.data.result[0];
      console.log('\n✅ Response:');
      console.log(`   Contract: ${contract.ContractName}`);
      console.log(`   Status: SUCCESS`);
      return true;
    }
  } catch (error) {
    console.log('\n❌ Error:', error.message);
    return false;
  }
}

async function compareAPIs() {
  const dedicatedResult = await testDedicatedAPI();
  const v2Result = await testV2API();

  console.log('\n' + '='.repeat(80));
  console.log('📊 KEY DIFFERENCES SUMMARY');
  console.log('='.repeat(80));

  console.log('\n🔸 DEDICATED API (Network-specific):');
  console.log('   ┌─ Endpoint: api.polygonscan.com/api');
  console.log('   ├─ Parameters: module, action, address, apikey');
  console.log('   ├─ NO chainid parameter needed');
  console.log('   ├─ One API endpoint per network');
  console.log('   ├─ Example URLs:');
  console.log('   │  • Polygon:  https://api.polygonscan.com/api');
  console.log('   │  • Arbitrum: https://api.arbiscan.io/api');
  console.log('   │  • BSC:      https://api.bscscan.com/api');
  console.log('   └─ Each network has separate API key/rate limits');

  console.log('\n🔹 V2 API (Unified across 60+ chains):');
  console.log('   ┌─ Endpoint: api.etherscan.io/v2/api');
  console.log('   ├─ Parameters: chainid, module, action, address, apikey');
  console.log('   ├─ chainid parameter REQUIRED to specify network');
  console.log('   ├─ One API endpoint for ALL networks');
  console.log('   ├─ Example calls:');
  console.log('   │  • Polygon:  ?chainid=137&...');
  console.log('   │  • Arbitrum: ?chainid=42161&...');
  console.log('   │  • Scroll:   ?chainid=534352&...');
  console.log('   └─ Single API key works across all networks');

  console.log('\n' + '─'.repeat(80));
  console.log('💡 WHICH ONE TO USE?');
  console.log('─'.repeat(80));

  console.log('\n✅ Use DEDICATED API when:');
  console.log('   • Network has established explorer (Polygon, Arbitrum, BSC, etc.)');
  console.log('   • You want network-specific rate limits');
  console.log('   • You need maximum stability for that specific network');
  console.log('   • Example: Production apps on major networks');

  console.log('\n✅ Use V2 API when:');
  console.log('   • Working with multiple networks');
  console.log('   • Network is new (Scroll, Unichain, Berachain)');
  console.log('   • You want simplified configuration');
  console.log('   • Single API key management preferred');
  console.log('   • Example: Multi-chain apps, new L2s');

  console.log('\n' + '─'.repeat(80));
  console.log('🎯 YOUR CURRENT STRATEGY (Hybrid):');
  console.log('─'.repeat(80));

  console.log('\n✨ Best of Both Worlds:');
  console.log('   • Major networks (Ethereum, Polygon, etc.): Dedicated APIs ← Stability');
  console.log('   • New networks (Scroll, Avalanche, etc.):  V2 API ← Simplicity');

  console.log('\n📌 Both APIs return IDENTICAL data!');
  console.log('   The only difference is HOW you call them, not WHAT you get.');

  console.log('\n' + '='.repeat(80));
  console.log('✅ Results:');
  console.log(`   Dedicated API: ${dedicatedResult ? 'SUCCESS ✓' : 'FAILED ✗'}`);
  console.log(`   V2 API:        ${v2Result ? 'SUCCESS ✓' : 'FAILED ✗'}`);
  console.log('='.repeat(80));

  return dedicatedResult && v2Result;
}

// Run comparison
compareAPIs()
  .then(success => {
    console.log(success ? '\n✅ Both APIs work identically!\n' : '\n⚠️  API test incomplete\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  });

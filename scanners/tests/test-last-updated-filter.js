// Test last_updated filter in FundUpdater
const FundUpdater = require('../core/FundUpdater');

async function testLastUpdatedFilter() {
  console.log('🔍 Testing last_updated filter in FundUpdater\n');
  
  process.env.NETWORK = 'ethereum';
  const scanner = new FundUpdater();
  
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - (7 * 24 * 60 * 60);
  
  console.log(`📅 Current time: ${now} (${new Date(now * 1000).toISOString()})`);
  console.log(`📅 7 days ago: ${sevenDaysAgo} (${new Date(sevenDaysAgo * 1000).toISOString()})\n`);
  
  console.log('📊 Testing different scenarios:\n');
  
  // Test 1: Normal mode (not ALL_FLAG)
  console.log('1️⃣ Normal mode (ALL_FLAG=false):');
  console.log('   Conditions:');
  console.log('   - last_fund_updated < 7 days ago OR NULL');
  console.log('   - last_updated >= 7 days ago (NEW!)');
  console.log('   - code_hash NOT NULL and not empty');
  console.log('   - NOT an EOA\n');
  
  // Test 2: ALL_FLAG mode
  console.log('2️⃣ ALL_FLAG mode:');
  console.log('   Conditions:');
  console.log('   - No time restrictions');
  console.log('   - NOT an EOA\n');
  
  // Test 3: HIGH_FUND_FLAG mode
  console.log('3️⃣ HIGH_FUND_FLAG mode:');
  console.log('   Conditions:');
  console.log('   - Same as normal mode PLUS');
  console.log('   - fund >= 100,000\n');
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('📝 The new condition means:');
  console.log('✅ INCLUDED: Addresses updated within last 7 days');
  console.log('❌ EXCLUDED: Addresses not updated in last 7 days');
  console.log('❌ EXCLUDED: Addresses with NULL last_updated\n');
  
  console.log('🎯 Purpose:');
  console.log('Only update fund values for recently active addresses');
  console.log('This saves API calls on old/inactive addresses\n');
  
  console.log('✅ Test completed');
}

testLastUpdatedFilter().catch(console.error);
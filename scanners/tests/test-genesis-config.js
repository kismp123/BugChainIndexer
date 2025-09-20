#!/usr/bin/env node
/**
 * Test genesis timestamps configuration
 */

const {
  GENESIS_TIMESTAMPS,
  getGenesisTimestamp,
  getGenesisInfo,
  addGenesisTimestamp,
  getSupportedChainIds,
  hasGenesisTimestamp
} = require('../config/genesis-timestamps');

function testGenesisConfig() {
  console.log('🔍 Testing Genesis Timestamps Configuration\n');
  console.log('='.repeat(60));
  
  // Test 1: Get all supported chains
  console.log('📊 Supported Chains:');
  const chainIds = getSupportedChainIds();
  chainIds.forEach(chainId => {
    const info = getGenesisInfo(chainId);
    console.log(`  ${chainId}: ${info.name} - ${new Date(info.timestamp * 1000).toISOString()}`);
  });
  
  console.log(`\nTotal networks: ${chainIds.length}`);
  
  // Test 2: Get specific timestamp
  console.log('\n🧪 Testing getGenesisTimestamp:');
  const testChains = [1, 10, 137, 99999];
  testChains.forEach(chainId => {
    const timestamp = getGenesisTimestamp(chainId);
    if (timestamp) {
      console.log(`  Chain ${chainId}: ${timestamp} (${new Date(timestamp * 1000).toISOString()})`);
    } else {
      console.log(`  Chain ${chainId}: Not found`);
    }
  });
  
  // Test 3: Check if chain has genesis
  console.log('\n🧪 Testing hasGenesisTimestamp:');
  console.log(`  Ethereum (1): ${hasGenesisTimestamp(1) ? '✅' : '❌'}`);
  console.log(`  Unknown (99999): ${hasGenesisTimestamp(99999) ? '✅' : '❌'}`);
  
  // Test 4: Add new network
  console.log('\n🧪 Testing addGenesisTimestamp:');
  try {
    // Add a test network
    addGenesisTimestamp(999999, {
      name: 'Test Network',
      timestamp: 1700000000,
      block: 0,
      date: '2023-11-14T22:13:20Z'
    });
    
    const testInfo = getGenesisInfo(999999);
    if (testInfo) {
      console.log(`  ✅ Successfully added: ${testInfo.name}`);
      console.log(`     Timestamp: ${testInfo.timestamp}`);
      console.log(`     Date: ${testInfo.date}`);
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
  
  // Test 5: Error handling
  console.log('\n🧪 Testing error handling:');
  try {
    addGenesisTimestamp(999998, { name: 'Bad Network' });
    console.log('  ❌ Should have thrown error for missing timestamp');
  } catch (error) {
    console.log(`  ✅ Correctly threw error: ${error.message}`);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 CONFIGURATION BENEFITS:\n');
  console.log('1. ✅ Centralized genesis timestamp management');
  console.log('2. ✅ Easy to add new networks');
  console.log('3. ✅ Human-readable dates included');
  console.log('4. ✅ Testnet support');
  console.log('5. ✅ Runtime network addition possible');
  
  console.log('\n📝 TO ADD A NEW NETWORK:');
  console.log('1. Edit config/genesis-timestamps.js');
  console.log('2. Add entry in GENESIS_TIMESTAMPS object:');
  console.log(`   chainId: {
     name: 'Network Name',
     timestamp: 1234567890,
     block: 0,
     date: '2024-01-01T00:00:00Z'
   }`);
  console.log('3. Or use addGenesisTimestamp() at runtime');
}

testGenesisConfig();
console.log('\n✅ Test completed');
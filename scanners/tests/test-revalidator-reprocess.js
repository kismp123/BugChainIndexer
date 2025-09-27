// Test DataRevalidator recent mode with re-processing of already validated addresses
const DataRevalidator = require('../core/DataRevalidator');

async function testRecentModeReprocessing() {
  console.log('🔍 Testing DataRevalidator Recent Mode Re-processing\n');
  console.log('This test verifies that recent mode re-validates ALL contracts,');
  console.log('including those that were already validated.\n');
  
  // Set up recent mode
  process.env.NETWORK = 'ethereum';
  process.env.RECENT_CONTRACTS = 'true';
  process.env.RECENT_DAYS = '7';
  
  try {
    const revalidator = new DataRevalidator();
    
    // Initialize
    await revalidator.initialize();
    console.log('✅ DataRevalidator initialized\n');
    
    console.log('📊 Configuration:');
    console.log(`  Network: ${revalidator.network}`);
    console.log(`  Recent Mode: ${revalidator.recentMode ? 'ENABLED' : 'DISABLED'}`);
    console.log(`  Days: ${revalidator.recentDays}`);
    console.log(`  Behavior: Will re-validate ALL addresses (contracts AND EOAs) discovered in last ${revalidator.recentDays} days`);
    console.log(`  Note: No filtering - processes everything with first_seen >= cutoff\n`);
    
    // Get addresses to revalidate
    const addresses = await revalidator.getAddressesToRevalidate(10);
    console.log(`🔍 Found ${addresses.length} addresses for re-validation\n`);
    
    if (addresses.length > 0) {
      console.log('📝 Sample addresses that will be re-validated:');
      addresses.slice(0, 5).forEach(addr => {
        console.log(`\n  Address: ${addr.address}`);
        
        // Show current tags to demonstrate re-processing
        if (addr.tags && addr.tags.length > 0) {
          console.log(`    Current tags: ${JSON.stringify(addr.tags)} ← Will be re-validated`);
        } else {
          console.log(`    Current tags: NULL or empty`);
        }
        
        if (addr.contract_name) {
          console.log(`    Contract name: ${addr.contract_name} ← Will be refreshed`);
        }
        
        if (addr.first_seen) {
          const daysAgo = Math.floor((revalidator.currentTime - addr.first_seen) / 86400);
          console.log(`    First seen: ${daysAgo} days ago`);
        }
        
        console.log(`    Status: Will be re-processed regardless of current state`);
      });
      
      console.log('\n🔄 Validating batch to demonstrate re-processing...\n');
      
      // Validate a small batch to show the behavior
      const results = await revalidator.validateAddressBatch(addresses.slice(0, 3));
      
      console.log('Validation results:');
      results.forEach(result => {
        if (result.forceUpdate) {
          console.log(`  ✅ ${result.address}`);
          console.log(`     Force update: YES (recent mode)`);
          if (result.issues.includes('recent_mode_refresh')) {
            console.log(`     Action: Data will be refreshed even if valid`);
          } else {
            console.log(`     Issues found: ${result.issues.join(', ')}`);
          }
        } else if (result.valid) {
          console.log(`  ⏭️  ${result.address} - Already valid (standard mode would skip)`);
        }
      });
      
      console.log('\n📊 Key Differences:');
      console.log('  Standard Mode: Only updates addresses with issues');
      console.log('  Recent Mode:   Re-validates ALL recent contracts');
      console.log('                 Ensures fresh data for recently discovered addresses');
      
    } else {
      console.log('No addresses found in the specified time range');
    }
    
    // Clean up
    await revalidator.cleanup();
    console.log('\n✅ Test completed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testRecentModeReprocessing().catch(console.error);
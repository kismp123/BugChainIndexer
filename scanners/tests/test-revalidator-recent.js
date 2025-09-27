// Test DataRevalidator with recent contracts mode
const DataRevalidator = require('../core/DataRevalidator');

async function testRecentContractsMode() {
  console.log('🔍 Testing DataRevalidator Recent Contracts Mode\n');
  
  // Test different configurations
  const configs = [
    { 
      mode: 'Standard',
      env: { NETWORK: 'ethereum' }
    },
    {
      mode: 'Recent 30 days',
      env: { NETWORK: 'ethereum', RECENT_CONTRACTS: 'true', RECENT_DAYS: '30' }
    },
    {
      mode: 'Recent 7 days',  
      env: { NETWORK: 'ethereum', RECENT_CONTRACTS: 'true', RECENT_DAYS: '7' }
    },
    {
      mode: 'Recent 1 day',
      env: { NETWORK: 'ethereum', RECENT_CONTRACTS: 'true', RECENT_DAYS: '1' }
    }
  ];
  
  for (const config of configs) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 Testing: ${config.mode}`);
    console.log('='.repeat(60));
    
    // Set environment variables
    Object.assign(process.env, config.env);
    
    try {
      const revalidator = new DataRevalidator();
      
      // Initialize
      await revalidator.init();
      
      // Show configuration
      console.log('\n📊 Configuration:');
      console.log(`  Network: ${revalidator.network}`);
      console.log(`  Recent Mode: ${revalidator.recentMode ? 'ENABLED' : 'DISABLED'}`);
      if (revalidator.recentMode) {
        console.log(`  Days: ${revalidator.recentDays}`);
        const cutoffTime = revalidator.currentTime - (revalidator.recentDays * 24 * 60 * 60);
        console.log(`  Cutoff Time: ${new Date(cutoffTime * 1000).toISOString()}`);
      }
      
      // Get addresses to revalidate (limited for testing)
      const addresses = await revalidator.getAddressesToRevalidate(10);
      
      console.log(`\n🔍 Found ${addresses.length} addresses to revalidate`);
      
      if (addresses.length > 0) {
        console.log('\n📝 Sample addresses:');
        addresses.slice(0, 5).forEach(addr => {
          console.log(`  - ${addr.address}`);
          if (addr.first_seen) {
            const daysAgo = Math.floor((revalidator.currentTime - addr.first_seen) / (24 * 60 * 60));
            console.log(`    First seen: ${daysAgo} days ago`);
          }
          console.log(`    Tags: ${addr.tags ? JSON.stringify(addr.tags) : 'NULL'}`);
          console.log(`    Contract Name: ${addr.contract_name || 'NULL'}`);
        });
      }
      
      // Clean up
      await revalidator.cleanup();
      
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n✅ Test completed');
}

// Run test
testRecentContractsMode().catch(console.error);
// Small test for DataRevalidator
const DataRevalidator = require('../core/DataRevalidator');

async function testDataRevalidatorSmall() {
  console.log('🔍 Testing DataRevalidator with small batch\n');
  
  process.env.NETWORK = 'ethereum';
  
  try {
    const revalidator = new DataRevalidator();
    
    // Initialize
    await revalidator.init();
    console.log('✅ DataRevalidator initialized\n');
    
    // Get a few addresses to revalidate
    const addresses = await revalidator.getAddressesToRevalidate(3);
    console.log(`📊 Found ${addresses.length} addresses to revalidate\n`);
    
    if (addresses.length > 0) {
      console.log('Addresses to validate:');
      addresses.forEach(addr => {
        console.log(`  - ${addr.address}`);
        console.log(`    Current deployed: ${addr.deployed || 'NULL'}`);
        console.log(`    Current tags: ${addr.tags ? JSON.stringify(addr.tags) : 'NULL'}`);
      });
      
      console.log('\n🔄 Running validation...\n');
      
      // Validate the batch
      const results = await revalidator.validateAddressBatch(addresses);
      
      console.log('Validation results:');
      results.forEach(result => {
        if (result.hasIssues) {
          console.log(`  ✅ ${result.address}`);
          console.log(`    Issues: ${result.issues.join(', ')}`);
          if (result.corrections.deployed !== undefined) {
            console.log(`    Deployed correction: ${result.corrections.deployed || 'NULL'}`);
          }
        }
      });
    } else {
      console.log('No addresses found that need revalidation');
    }
    
    // Clean up
    await revalidator.cleanup();
    console.log('\n✅ Test completed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testDataRevalidatorSmall().catch(console.error);
const FundUpdater = require('./core/FundUpdater.js');

async function testPriceUpdate() {
  console.log('Testing FundUpdater price update with free API key...\n');
  
  const scanner = new FundUpdater('ethereum');
  
  try {
    await scanner.initialize();
    
    console.log('Step 1: Insert missing symbols...');
    await scanner.insertMissingSymbols();
    
    console.log('\nStep 2: Update token prices...');
    await scanner.updateTokenPrices();
    
    console.log('\nTest completed successfully');
  } catch (error) {
    console.error('Test failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await scanner.cleanup();
  }
}

testPriceUpdate();

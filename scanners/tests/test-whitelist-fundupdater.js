// Test FundUpdater with token whitelist
const FundUpdater = require('../core/FundUpdater');

async function testWhitelistFundUpdater() {
  process.env.NETWORK = 'ethereum';
  process.env.MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjM4MTI3NGEwLTA3YTYtNGM4MS1hNDYyLWVkMzFhN2Y0OWFjNCIsIm9yZ0lkIjoiNDY0MjM3IiwidXNlcklkIjoiNDc3NjAyIiwidHlwZUlkIjoiY2Y5YWY0NjYtZWU3Ny00YTYzLWEyODMtOTFiNmIwMjNmZWFjIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTQ3ODEwNjksImV4cCI6NDkxMDU0MTA2OX0.eeLM7_cV0lmemEmUk-PS5hBF8MnwjBmEtQJLl_ET7KQ';
  
  const scanner = new FundUpdater();
  
  console.log('🔍 Testing FundUpdater with token whitelist\n');
  
  // Test with the problematic address that had MAGA token issue
  const testAddress = '0x965dc72531bc322cab5537d432bb14451cabb30d';
  
  console.log(`📊 Testing address: ${testAddress}`);
  console.log('This address has MAGA token which should be filtered out\n');
  
  const portfolio = await scanner.fetchPortfolioWithMoralis(testAddress);
  
  if (portfolio) {
    console.log('\n💰 Results:');
    console.log(`  Native (ETH): $${portfolio.nativeUsdValue.toFixed(2)}`);
    console.log(`  Whitelisted Tokens: ${portfolio.tokens.length}`);
    console.log(`  Total Value: $${portfolio.totalUsdValue.toLocaleString()}`);
    
    // Check if MAGA was filtered out
    const hasMAGA = portfolio.tokens.some(t => t.symbol === 'MAGA');
    console.log(`\n✅ MAGA token filtered out: ${!hasMAGA}`);
    
    // Show included tokens
    if (portfolio.tokens.length > 0) {
      console.log('\n📋 Included tokens:');
      portfolio.tokens
        .filter(t => parseFloat(t.usd_value) > 1000)
        .slice(0, 5)
        .forEach(token => {
          console.log(`  - ${token.symbol}: $${parseFloat(token.usd_value).toLocaleString()}`);
        });
    }
  }
  
  console.log('\n✅ Test completed');
}

testWhitelistFundUpdater().catch(console.error);
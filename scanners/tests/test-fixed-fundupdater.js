// Test the fixed FundUpdater
const FundUpdater = require('../core/FundUpdater');

async function testFixed() {
  process.env.NETWORK = 'ethereum';
  
  const scanner = new FundUpdater();
  
  // Test problematic contract addresses
  const contracts = [
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',  // WETH
    '0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee',  // weETH  
    '0xdac17f958d2ee523a2206206994597c13d831ec7',  // USDT
  ];
  
  console.log('🔍 Testing fixed FundUpdater with token contracts\n');
  
  for (const addr of contracts) {
    console.log(`\n📊 Testing ${addr}`);
    const portfolio = await scanner.fetchPortfolioWithMoralis(addr);
    
    if (portfolio) {
      console.log(`  Total USD: $${portfolio.totalUsdValue.toLocaleString()}`);
      console.log(`  Will store: $${Math.floor(portfolio.totalUsdValue).toLocaleString()}`);
    }
  }
  
  console.log('\n✅ Test completed');
}

testFixed().catch(console.error);
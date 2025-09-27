// Test with EXACT same logic as FundUpdater.js
const FundUpdater = require('../core/FundUpdater');

async function checkAddressExact(address) {
  process.env.NETWORK = 'ethereum';
  process.env.MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjM4MTI3NGEwLTA3YTYtNGM4MS1hNDYyLWVkMzFhN2Y0OWFjNCIsIm9yZ0lkIjoiNDY0MjM3IiwidXNlcklkIjoiNDc3NjAyIiwidHlwZUlkIjoiY2Y5YWY0NjYtZWU3Ny00YTYzLWEyODMtOTFiNmIwMjNmZWFjIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTQ3ODEwNjksImV4cCI6NDkxMDU0MTA2OX0.eeLM7_cV0lmemEmUk-PS5hBF8MnwjBmEtQJLl_ET7KQ';
  
  const scanner = new FundUpdater();
  
  console.log(`\n🔍 Using EXACT FundUpdater logic for: ${address}\n`);
  
  // Call the actual FundUpdater method
  const portfolio = await scanner.fetchPortfolioWithMoralis(address);
  
  if (portfolio) {
    console.log('\n💰 Results (from FundUpdater):');
    console.log(`   Native ETH:    $${portfolio.nativeUsdValue.toFixed(2)}`);
    console.log(`   Token Count:   ${portfolio.tokens.length}`);
    console.log(`   ──────────────────────────────`);
    console.log(`   ✅ TOTAL:      $${portfolio.totalUsdValue.toLocaleString()}`);
    
    // Show top tokens
    if (portfolio.tokens.length > 0) {
      console.log('\n📋 Top tokens included:');
      portfolio.tokens
        .sort((a, b) => parseFloat(b.usd_value) - parseFloat(a.usd_value))
        .slice(0, 5)
        .forEach(token => {
          console.log(`   - ${token.symbol}: $${parseFloat(token.usd_value).toLocaleString()}`);
        });
    }
    
    // This is what FundUpdater would store in DB
    const dbValue = Math.floor(portfolio.totalUsdValue);
    console.log(`\n📁 Would store in DB: $${dbValue.toLocaleString()}`);
    
    // Check current DB value
    const { Client } = require('pg');
    const client = new Client({
      host: 'localhost',
      port: 5432,
      database: 'bugchain_indexer',
      user: 'postgres',
      password: ''
    });
    
    try {
      await client.connect();
      const dbResult = await client.query(
        'SELECT fund, last_fund_updated FROM addresses WHERE address = $1 AND network = $2',
        [address.toLowerCase(), 'ethereum']
      );
      
      if (dbResult.rows.length > 0) {
        const row = dbResult.rows[0];
        console.log(`📁 Current DB value: $${(row.fund || 0).toLocaleString()}`);
        
        if (row.fund !== dbValue) {
          console.log(`   ⚠️  DB needs update: ${row.fund} → ${dbValue}`);
        } else {
          console.log(`   ✅ DB value is correct`);
        }
      } else {
        console.log(`📁 Current DB: Not found (would be inserted)`);
      }
      
      await client.end();
    } catch (e) {
      console.log(`📁 Database: Unable to connect`);
    }
  } else {
    console.log('❌ Failed to fetch portfolio');
  }
  
  console.log('\n✅ Test completed');
}

// Test the address
checkAddressExact('0x234F7b256c1A05dD6FD1340ADdf565c6404a2A3E').catch(console.error);
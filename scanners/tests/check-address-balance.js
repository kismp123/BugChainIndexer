const axios = require('axios');

async function checkAddressBalance(address) {
  const apiKey = process.env.MORALIS_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjM4MTI3NGEwLTA3YTYtNGM4MS1hNDYyLWVkMzFhN2Y0OWFjNCIsIm9yZ0lkIjoiNDY0MjM3IiwidXNlcklkIjoiNDc3NjAyIiwidHlwZUlkIjoiY2Y5YWY0NjYtZWU3Ny00YTYzLWEyODMtOTFiNmIwMjNmZWFjIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTQ3ODEwNjksImV4cCI6NDkxMDU0MTA2OX0.eeLM7_cV0lmemEmUk-PS5hBF8MnwjBmEtQJLl_ET7KQ';
  
  console.log(`\n🔍 Checking balance for address: ${address}\n`);
  
  try {
    // Check Ethereum network
    const response = await axios.get(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/tokens`,
      {
        params: { 
          chain: 'eth',
          limit: 100
        },
        headers: { 
          'accept': 'application/json',
          'X-API-Key': apiKey 
        }
      }
    );

    const data = response.data.result || [];
    console.log(`📊 Found ${data.length} tokens on Ethereum\n`);
    
    let totalUsdValue = 0;
    let nativeBalance = 0;
    const significantTokens = [];
    
    // Process each token
    data.forEach(token => {
      const usdValue = parseFloat(token.usd_value || 0);
      totalUsdValue += usdValue;
      
      // Show native ETH
      if (token.native_token) {
        nativeBalance = usdValue;
        console.log(`💰 Native ETH:`);
        console.log(`   Balance: ${token.balance_formatted} ETH`);
        console.log(`   Value: $${usdValue.toLocaleString()}\n`);
      }
      // Show tokens worth over $1000
      else if (usdValue > 1000) {
        significantTokens.push({
          symbol: token.symbol,
          balance: token.balance_formatted,
          value: usdValue,
          address: token.token_address
        });
      }
    });
    
    // Display significant tokens
    if (significantTokens.length > 0) {
      console.log(`📈 Significant tokens (>$1,000):`);
      significantTokens
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
        .forEach(token => {
          console.log(`   ${token.symbol}: $${token.value.toLocaleString()}`);
          console.log(`      Balance: ${token.balance}`);
          console.log(`      Contract: ${token.address}\n`);
        });
    }
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Total Portfolio Value: $${totalUsdValue.toLocaleString()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    // Check if it's a contract
    try {
      const etherscanUrl = `https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=964G8PEYWFX6MXG8IW9JMBFM9TP4UTW6VI`;
      const etherscanResp = await axios.get(etherscanUrl);
      const isContract = etherscanResp.data.status === '1';
      console.log(`🏢 Address Type: ${isContract ? 'CONTRACT' : 'EOA (Wallet)'}`);
      
      if (isContract && etherscanResp.data.result) {
        const abi = JSON.parse(etherscanResp.data.result);
        const hasName = abi.some(item => item.name === 'name' && item.type === 'function');
        const hasSymbol = abi.some(item => item.name === 'symbol' && item.type === 'function');
        if (hasName && hasSymbol) {
          console.log(`   Likely a TOKEN CONTRACT`);
        }
      }
    } catch (e) {
      // Ignore etherscan check errors
    }
    
    // Check database value
    console.log('\n📁 Database Check:');
    const { Client } = require('pg');
    const client = new Client({
      host: 'localhost',
      port: 5432,
      database: 'bugchain_indexer',
      user: 'postgres',
      password: ''
    });
    
    await client.connect();
    const dbResult = await client.query(
      'SELECT fund, network, last_fund_updated FROM addresses WHERE address = $1',
      [address.toLowerCase()]
    );
    
    if (dbResult.rows.length > 0) {
      console.log('   Found in database:');
      dbResult.rows.forEach(row => {
        const updated = row.last_fund_updated ? new Date(row.last_fund_updated * 1000).toISOString() : 'Never';
        console.log(`   - ${row.network}: $${(row.fund || 0).toLocaleString()} (Updated: ${updated})`);
      });
    } else {
      console.log('   Not found in database');
    }
    
    await client.end();
    
    return totalUsdValue;
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return null;
  }
}

// Check the specific address
checkAddressBalance('0x965dc72531bc322cab5537d432bb14451cabb30d');
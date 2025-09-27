const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function checkAddressWithWhitelist(address) {
  const apiKey = process.env.MORALIS_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjM4MTI3NGEwLTA3YTYtNGM4MS1hNDYyLWVkMzFhN2Y0OWFjNCIsIm9yZ0lkIjoiNDY0MjM3IiwidXNlcklkIjoiNDc3NjAyIiwidHlwZUlkIjoiY2Y5YWY0NjYtZWU3Ny00YTYzLWEyODMtOTFiNmIwMjNmZWFjIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTQ3ODEwNjksImV4cCI6NDkxMDU0MTA2OX0.eeLM7_cV0lmemEmUk-PS5hBF8MnwjBmEtQJLl_ET7KQ';
  
  // Load whitelist
  const tokensFile = path.join(__dirname, '..', 'tokens', 'ethereum.json');
  const tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
  const whitelist = new Set(tokens.map(token => token.address.toLowerCase()));
  
  console.log(`\n🔍 Checking balance for address: ${address}`);
  console.log(`📋 Using whitelist with ${whitelist.size} approved tokens\n`);
  
  try {
    // Fetch from Moralis API
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
    console.log(`📊 Moralis returned ${data.length} tokens\n`);
    
    let nativeBalance = 0;
    let whitelistedValue = 0;
    let nonWhitelistedValue = 0;
    const whitelistedTokens = [];
    const skippedTokens = [];
    
    // Process each token
    data.forEach(token => {
      const usdValue = parseFloat(token.usd_value || 0);
      const tokenAddr = token.token_address?.toLowerCase();
      
      // Native ETH
      if (token.native_token) {
        nativeBalance = usdValue;
        console.log(`💰 Native ETH:`);
        console.log(`   Balance: ${token.balance_formatted} ETH`);
        console.log(`   Value: $${usdValue.toLocaleString()}\n`);
      }
      // Check whitelist
      else if (whitelist.has(tokenAddr)) {
        whitelistedValue += usdValue;
        if (usdValue > 100) {
          whitelistedTokens.push({
            symbol: token.symbol,
            balance: token.balance_formatted,
            value: usdValue,
            address: tokenAddr
          });
        }
      } else {
        nonWhitelistedValue += usdValue;
        if (usdValue > 100) {
          skippedTokens.push({
            symbol: token.symbol,
            balance: token.balance_formatted,
            value: usdValue,
            address: tokenAddr
          });
        }
      }
    });
    
    // Display whitelisted tokens
    if (whitelistedTokens.length > 0) {
      console.log(`✅ Whitelisted Tokens (>$100):`);
      whitelistedTokens
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
        .forEach(token => {
          console.log(`   ${token.symbol}: $${token.value.toLocaleString()}`);
          console.log(`      Balance: ${token.balance}`);
        });
      console.log();
    }
    
    // Display skipped tokens
    if (skippedTokens.length > 0) {
      console.log(`❌ Non-Whitelisted Tokens (>$100, EXCLUDED):`);
      skippedTokens
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)
        .forEach(token => {
          console.log(`   ${token.symbol}: $${token.value.toLocaleString()}`);
          console.log(`      Balance: ${token.balance}`);
        });
      console.log();
    }
    
    const totalWhitelisted = nativeBalance + whitelistedValue;
    const totalAll = nativeBalance + whitelistedValue + nonWhitelistedValue;
    
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Portfolio Summary:`);
    console.log(`   Native ETH:         $${nativeBalance.toLocaleString()}`);
    console.log(`   Whitelisted Tokens: $${whitelistedValue.toLocaleString()}`);
    console.log(`   ──────────────────────────────────────`);
    console.log(`   ✅ TOTAL (Whitelisted): $${totalWhitelisted.toLocaleString()}`);
    console.log();
    console.log(`   ❌ Excluded Tokens: $${nonWhitelistedValue.toLocaleString()}`);
    console.log(`   Total (if included): $${totalAll.toLocaleString()}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    // Check if it's a contract
    try {
      const etherscanUrl = `https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=964G8PEYWFX6MXG8IW9JMBFM9TP4UTW6VI`;
      const etherscanResp = await axios.get(etherscanUrl);
      const isContract = etherscanResp.data.status === '1';
      console.log(`🏢 Address Type: ${isContract ? 'CONTRACT' : 'EOA (Wallet)'}`);
    } catch (e) {
      // Ignore errors
    }
    
    // Check database
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
        const updated = row.last_fund_updated ? new Date(row.last_fund_updated * 1000).toISOString() : 'Never';
        console.log(`\n📁 Database Status:`);
        console.log(`   Stored Value: $${(row.fund || 0).toLocaleString()}`);
        console.log(`   Last Updated: ${updated}`);
      } else {
        console.log(`\n📁 Database Status: Not found`);
      }
      
      await client.end();
    } catch (e) {
      // Database connection might fail
      console.log(`\n📁 Database Status: Unable to connect`);
    }
    
    return totalWhitelisted;
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    return null;
  }
}

// Check the specific address
checkAddressWithWhitelist('0x234F7b256c1A05dD6FD1340ADdf565c6404a2A3E');
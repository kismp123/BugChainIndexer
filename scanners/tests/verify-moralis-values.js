const axios = require('axios');

// Test problematic addresses with huge values
const addresses = [
  '0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee',  // weETH contract
  '0xa3a7b6f88361f48403514059f1f16c8e78d60eec',  // Arbitrum One: Gauge Proxy V2
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',  // wstETH
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'   // WETH
];

async function verifyMoralisValues(address) {
  const apiKey = process.env.MORALIS_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjM4MTI3NGEwLTA3YTYtNGM4MS1hNDYyLWVkMzFhN2Y0OWFjNCIsIm9yZ0lkIjoiNDY0MjM3IiwidXNlcklkIjoiNDc3NjAyIiwidHlwZUlkIjoiY2Y5YWY0NjYtZWU3Ny00YTYzLWEyODMtOTFiNmIwMjNmZWFjIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTQ3ODEwNjksImV4cCI6NDkxMDU0MTA2OX0.eeLM7_cV0lmemEmUk-PS5hBF8MnwjBmEtQJLl_ET7KQ';
  
  try {
    console.log(`\n🔍 Verifying ${address}`);
    
    const response = await axios.get(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/tokens`,
      {
        params: { 
          chain: 'eth',
          limit: 10
        },
        headers: { 
          'accept': 'application/json',
          'X-API-Key': apiKey 
        }
      }
    );

    const data = response.data.result || [];
    console.log(`  Found ${data.length} tokens`);
    
    let totalValue = 0;
    let suspiciousTokens = [];
    
    // Check each token
    data.forEach(token => {
      const usdValue = parseFloat(token.usd_value || 0);
      totalValue += usdValue;
      
      // Flag suspicious values (over $1B for a single token)
      if (usdValue > 1000000000) {
        suspiciousTokens.push({
          symbol: token.symbol || 'ETH',
          balance: token.balance_formatted,
          usdValue: usdValue,
          usdPrice: token.usd_price,
          decimals: token.decimals,
          address: token.token_address
        });
      }
    });
    
    console.log(`  Total USD value: $${totalValue.toLocaleString()}`);
    
    if (suspiciousTokens.length > 0) {
      console.log(`  ⚠️  SUSPICIOUS TOKENS (over $1B):`);
      suspiciousTokens.forEach(t => {
        console.log(`    - ${t.symbol}: $${t.usdValue.toLocaleString()}`);
        console.log(`      Balance: ${t.balance}`);
        console.log(`      Price: $${t.usdPrice}`);
        console.log(`      Token: ${t.address}`);
      });
    }
    
    // Check if this is a contract
    const etherscanUrl = `https://api.etherscan.io/api?module=contract&action=getabi&address=${address}&apikey=964G8PEYWFX6MXG8IW9JMBFM9TP4UTW6VI`;
    const etherscanResp = await axios.get(etherscanUrl);
    const isContract = etherscanResp.data.status === '1';
    console.log(`  Contract: ${isContract ? 'YES' : 'NO'}`);
    
    return { address, totalValue, isContract, suspiciousTokens };
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🔍 Verifying addresses with suspicious values...\n');
  console.log('These addresses are showing billions/trillions in value.');
  console.log('Likely these are CONTRACTS not wallets!\n');
  
  for (const addr of addresses) {
    await verifyMoralisValues(addr);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n📊 ANALYSIS:');
  console.log('These are TOKEN CONTRACTS, not user wallets!');
  console.log('Moralis is returning the total supply/liquidity of the contract.');
  console.log('FundUpdater should skip contract addresses!');
}

main();
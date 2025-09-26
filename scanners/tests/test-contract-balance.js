const axios = require('axios');
const { ethers } = require('ethers');

// Test getting actual balance for contracts
async function getContractRealBalance(address) {
  const apiKey = process.env.MORALIS_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjM4MTI3NGEwLTA3YTYtNGM4MS1hNDYyLWVkMzFhN2Y0OWFjNCIsIm9yZ0lkIjoiNDY0MjM3IiwidXNlcklkIjoiNDc3NjAyIiwidHlwZUlkIjoiY2Y5YWY0NjYtZWU3Ny00YTYzLWEyODMtOTFiNmIwMjNmZWFjIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTQ3ODEwNjksImV4cCI6NDkxMDU0MTA2OX0.eeLM7_cV0lmemEmUk-PS5hBF8MnwjBmEtQJLl_ET7KQ';
  
  console.log(`\n🔍 Analyzing ${address}`);
  
  try {
    // Get token balances from Moralis
    const response = await axios.get(
      `https://deep-index.moralis.io/api/v2.2/wallets/${address}/tokens`,
      {
        params: { 
          chain: 'eth',
          limit: 50
        },
        headers: { 
          'accept': 'application/json',
          'X-API-Key': apiKey 
        }
      }
    );
    
    const tokens = response.data.result || [];
    console.log(`  Moralis returned ${tokens.length} tokens`);
    
    // Separate analysis
    let nativeBalance = 0;
    let ownTokenBalance = 0;  // Balance of its own token
    let otherTokensBalance = 0;  // Balance of other tokens
    let suspiciousTokens = [];
    
    for (const token of tokens) {
      const usdValue = parseFloat(token.usd_value || 0);
      const tokenAddr = token.token_address?.toLowerCase();
      
      // Check if native
      if (token.native_token) {
        nativeBalance = usdValue;
        console.log(`  💰 Native ETH: $${usdValue.toLocaleString()}`);
      }
      // Check if it's the contract's own token
      else if (tokenAddr === address.toLowerCase()) {
        ownTokenBalance = usdValue;
        console.log(`  🔄 Own token (${token.symbol}): $${usdValue.toLocaleString()} - EXCLUDE THIS`);
        suspiciousTokens.push({
          symbol: token.symbol,
          value: usdValue,
          reason: "Contract's own token"
        });
      }
      // Check for wrapped version of own token
      else if (token.symbol && address.toLowerCase().includes(token.symbol.toLowerCase())) {
        console.log(`  ⚠️  Related token (${token.symbol}): $${usdValue.toLocaleString()} - Might be liquidity`);
        suspiciousTokens.push({
          symbol: token.symbol,
          value: usdValue,
          reason: "Possibly related token/liquidity"
        });
      }
      // Other tokens - these are real holdings
      else {
        otherTokensBalance += usdValue;
        if (usdValue > 1000000) { // Over $1M
          console.log(`  ✅ Holds ${token.symbol}: $${usdValue.toLocaleString()}`);
        }
      }
    }
    
    const realBalance = nativeBalance + otherTokensBalance;
    const inflatedBalance = nativeBalance + ownTokenBalance + otherTokensBalance;
    
    console.log(`\n  📊 Balance Analysis:`);
    console.log(`    Native ETH:        $${nativeBalance.toLocaleString()}`);
    console.log(`    Other tokens:      $${otherTokensBalance.toLocaleString()}`);
    console.log(`    Own token:         $${ownTokenBalance.toLocaleString()} (SHOULD EXCLUDE)`);
    console.log(`    ──────────────────────────────`);
    console.log(`    Real balance:      $${realBalance.toLocaleString()}`);
    console.log(`    Inflated balance:  $${inflatedBalance.toLocaleString()}`);
    
    if (suspiciousTokens.length > 0) {
      console.log(`\n  🚨 Tokens to exclude:`);
      suspiciousTokens.forEach(t => {
        console.log(`    - ${t.symbol}: $${t.value.toLocaleString()} (${t.reason})`);
      });
    }
    
    return {
      address,
      realBalance,
      inflatedBalance,
      suspiciousTokens
    };
    
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🔍 Testing how to get REAL contract balances\n');
  console.log('Problem: Contracts show their own token supply as balance');
  console.log('Solution: Exclude the contract\'s own token from calculation\n');
  
  const contracts = [
    '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',  // WETH
    '0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee',  // weETH
    '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0',  // wstETH
    '0xdac17f958d2ee523a2206206994597c13d831ec7',  // USDT
    '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',  // USDC
  ];
  
  for (const contract of contracts) {
    await getContractRealBalance(contract);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n📋 RECOMMENDATION:');
  console.log('1. Filter out tokens where token_address == wallet_address');
  console.log('2. For known token contracts, exclude their primary liquidity token');
  console.log('3. Or mark these as "Contract" and show separately in UI');
}

main();
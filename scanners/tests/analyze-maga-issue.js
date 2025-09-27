const axios = require('axios');

async function analyzeMagaIssue() {
  const address = '0x965dc72531bc322cab5537d432bb14451cabb30d';
  const magaToken = '0xda2e903b0b67f30bf26bd3464f9ee1a383bbbe5f';
  const apiKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjM4MTI3NGEwLTA3YTYtNGM4MS1hNDYyLWVkMzFhN2Y0OWFjNCIsIm9yZ0lkIjoiNDY0MjM3IiwidXNlcklkIjoiNDc3NjAyIiwidHlwZUlkIjoiY2Y5YWY0NjYtZWU3Ny00YTYzLWEyODMtOTFiNmIwMjNmZWFjIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTQ3ODEwNjksImV4cCI6NDkxMDU0MTA2OX0.eeLM7_cV0lmemEmUk-PS5hBF8MnwjBmEtQJLl_ET7KQ';
  
  console.log('🔍 Analyzing MAGA token issue\n');
  console.log(`Address: ${address}`);
  console.log(`MAGA Token: ${magaToken}\n`);
  
  // Check if the address is the MAGA token contract itself
  console.log(`Is address same as MAGA token? ${address.toLowerCase() === magaToken.toLowerCase() ? 'YES' : 'NO'}\n`);
  
  // Get token info
  try {
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
    const magaData = data.find(t => t.token_address?.toLowerCase() === magaToken.toLowerCase());
    
    if (magaData) {
      console.log('📊 MAGA Token Details from Moralis:');
      console.log(`   Symbol: ${magaData.symbol}`);
      console.log(`   Name: ${magaData.name}`);
      console.log(`   Balance: ${magaData.balance_formatted}`);
      console.log(`   Raw Balance: ${magaData.balance}`);
      console.log(`   Decimals: ${magaData.decimals}`);
      console.log(`   USD Price: $${magaData.usd_price}`);
      console.log(`   USD Value: $${parseFloat(magaData.usd_value).toLocaleString()}`);
      console.log(`   Total Supply: ${magaData.total_supply_formatted}`);
      console.log(`   Percentage of Supply: ${magaData.percentage_relative_to_total_supply}%`);
      
      // Calculate real value
      const realBalance = parseFloat(magaData.balance) / Math.pow(10, magaData.decimals);
      const realValue = realBalance * parseFloat(magaData.usd_price);
      console.log(`\n📈 Manual Calculation:`);
      console.log(`   Real Balance: ${realBalance.toLocaleString()} MAGA`);
      console.log(`   USD Price: $${magaData.usd_price}`);
      console.log(`   Calculated Value: $${realValue.toLocaleString()}`);
      console.log(`   Moralis Value: $${parseFloat(magaData.usd_value).toLocaleString()}`);
      console.log(`   Difference: ${(parseFloat(magaData.usd_value) / realValue).toFixed(2)}x`);
    }
    
    // Check what this address actually is
    console.log('\n🏢 Contract Analysis:');
    const etherscanUrl = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${address}&apikey=964G8PEYWFX6MXG8IW9JMBFM9TP4UTW6VI`;
    const etherscanResp = await axios.get(etherscanUrl);
    
    if (etherscanResp.data.result && etherscanResp.data.result[0]) {
      const contract = etherscanResp.data.result[0];
      console.log(`   Contract Name: ${contract.ContractName || 'Unknown'}`);
      console.log(`   Compiler: ${contract.CompilerVersion || 'Unknown'}`);
      console.log(`   Verified: ${contract.SourceCode ? 'Yes' : 'No'}`);
    }
    
    // Check if it's actually the MAGA Trumpers contract
    const magaEtherscanUrl = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${magaToken}&apikey=964G8PEYWFX6MXG8IW9JMBFM9TP4UTW6VI`;
    const magaEtherscanResp = await axios.get(magaEtherscanUrl);
    
    if (magaEtherscanResp.data.result && magaEtherscanResp.data.result[0]) {
      const magaContract = magaEtherscanResp.data.result[0];
      console.log(`\n📊 MAGA Token Contract:`);
      console.log(`   Contract Name: ${magaContract.ContractName || 'Unknown'}`);
      console.log(`   Address: ${magaToken}`);
    }
    
    console.log('\n⚠️  ANALYSIS:');
    console.log('The issue appears to be with the MAGA token price or supply calculation.');
    console.log('The value shown ($852B) is clearly incorrect for this token.');
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

analyzeMagaIssue();
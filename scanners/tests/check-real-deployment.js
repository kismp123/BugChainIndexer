const axios = require('axios');

async function checkRealDeploymentTime() {
  console.log('🔍 Checking real deployment times for affected contracts\n');
  
  const contracts = [
    { address: '0xdac17f958d2ee523a2206206994597c13d831ec7', name: 'USDT' },
    { address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', name: 'USDC' },
    { address: '0x6b175474e89094c44da98b954eedeac495271d0f', name: 'DAI' }
  ];
  
  for (const contract of contracts) {
    console.log(`📊 ${contract.name} (${contract.address})`);
    
    try {
      // Get contract creation transaction from Etherscan
      const url = `https://api.etherscan.io/api?module=contract&action=getcontractcreation&contractaddresses=${contract.address}&apikey=964G8PEYWFX6MXG8IW9JMBFM9TP4UTW6VI`;
      const response = await axios.get(url);
      
      if (response.data.status === '1' && response.data.result && response.data.result.length > 0) {
        const creation = response.data.result[0];
        console.log(`  Creation TX: ${creation.txHash}`);
        console.log(`  Creator: ${creation.contractCreator}`);
        
        // Get block timestamp
        const blockUrl = `https://api.etherscan.io/api?module=block&action=getblocknobytime&timestamp=${creation.timestamp || 0}&closest=before&apikey=964G8PEYWFX6MXG8IW9JMBFM9TP4UTW6VI`;
        
        // Alternative: Get transaction details
        const txUrl = `https://api.etherscan.io/api?module=proxy&action=eth_getTransactionByHash&txhash=${creation.txHash}&apikey=964G8PEYWFX6MXG8IW9JMBFM9TP4UTW6VI`;
        const txResponse = await axios.get(txUrl);
        
        if (txResponse.data.result) {
          const blockNumber = parseInt(txResponse.data.result.blockNumber, 16);
          
          // Get block details
          const blockDetailsUrl = `https://api.etherscan.io/api?module=proxy&action=eth_getBlockByNumber&tag=${txResponse.data.result.blockNumber}&boolean=true&apikey=964G8PEYWFX6MXG8IW9JMBFM9TP4UTW6VI`;
          const blockResponse = await axios.get(blockDetailsUrl);
          
          if (blockResponse.data.result) {
            const timestamp = parseInt(blockResponse.data.result.timestamp, 16);
            const date = new Date(timestamp * 1000);
            
            console.log(`  Block: ${blockNumber}`);
            console.log(`  Timestamp: ${timestamp}`);
            console.log(`  Date: ${date.toISOString()}`);
            console.log(`  ❌ DB has: 1758782560 (${new Date(1758782560 * 1000).toISOString()})`);
            console.log(`  ✅ Should be: ${timestamp}`);
          }
        }
      } else {
        console.log(`  ❌ Could not fetch creation data`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }
    
    console.log();
    await new Promise(r => setTimeout(r, 1000)); // Rate limiting
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📝 ANALYSIS:');
  console.log('The timestamp 1758782560 (2025-09-25) is incorrect.');
  console.log('This appears to be currentTime from when the scanner ran.');
  console.log('The bug is likely in the code that sets deployed = currentTime');
  console.log('instead of fetching the actual deployment time from blockchain.\n');
}

checkRealDeploymentTime();
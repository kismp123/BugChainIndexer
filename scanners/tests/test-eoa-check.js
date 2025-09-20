#!/usr/bin/env node
/**
 * Check if "No data found" addresses are actually EOAs or contracts
 */

const axios = require('axios');
require('dotenv').config();

async function checkIfEOA() {
  const apiKey = process.env.DEFAULT_ETHERSCAN_KEYS.split(',')[0];
  
  console.log('🔍 Checking if "No data found" addresses are EOAs or Contracts\n');
  console.log('='.repeat(60));
  
  // Real addresses from database that returned "No data found"
  const addresses = [
    { address: '0x1feb00f463940bb85958a94bd45f1ab58d4afd36', chainId: 10, network: 'Optimism' },
    { address: '0x244f80d56a33809351139a5b13abcac12162113c', chainId: 10, network: 'Optimism' },
    { address: '0xccc1652fbf5b7d6453c25d3a14469d0f7a66d8ef', chainId: 42161, network: 'Arbitrum' },
    { address: '0x493ceafc6d8d8cb07c9d85842eccd06ee6f3b518', chainId: 42161, network: 'Arbitrum' },
    { address: '0x3403338c6f9e63ba57df8be093f2ca63a2e09c1b', chainId: 42161, network: 'Arbitrum' },
  ];
  
  for (const item of addresses) {
    console.log(`\n📋 Checking: ${item.address}`);
    console.log(`   Network: ${item.network} (Chain ${item.chainId})`);
    
    try {
      // Method 1: Check if address has code using eth_getCode
      const codeResponse = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          module: 'proxy',
          action: 'eth_getCode',
          address: item.address,
          tag: 'latest',
          chainid: item.chainId,
          apikey: apiKey
        },
        timeout: 5000
      });
      
      const code = codeResponse.data.result;
      const hasCode = code && code !== '0x' && code !== '0x0';
      
      console.log(`   Code result: ${code ? code.substring(0, 10) + '...' : 'null'}`);
      console.log(`   Has code: ${hasCode ? '✅ YES (CONTRACT)' : '❌ NO (EOA)'}`);
      
      if (hasCode) {
        // If it's a contract, try to get transactions
        const txResponse = await axios.get('https://api.etherscan.io/v2/api', {
          params: {
            module: 'account',
            action: 'txlist',
            address: item.address,
            startblock: 0,
            endblock: 99999999,
            page: 1,
            offset: 1,
            sort: 'asc',
            chainid: item.chainId,
            apikey: apiKey
          },
          timeout: 5000
        });
        
        if (txResponse.data.status === '1' && txResponse.data.result.length > 0) {
          const firstTx = txResponse.data.result[0];
          console.log(`   First tx: ${firstTx.hash}`);
          console.log(`   Block: ${firstTx.blockNumber}`);
          console.log(`   Timestamp: ${new Date(firstTx.timeStamp * 1000).toISOString()}`);
        }
      }
      
      // Method 2: Check balance (both EOA and contracts can have balance)
      const balanceResponse = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          module: 'account',
          action: 'balance',
          address: item.address,
          tag: 'latest',
          chainid: item.chainId,
          apikey: apiKey
        },
        timeout: 5000
      });
      
      const balance = balanceResponse.data.result;
      console.log(`   Balance: ${balance} wei`);
      
      // Conclusion
      if (!hasCode) {
        console.log(`   🎯 Conclusion: This is an EOA (Externally Owned Account)`);
        console.log(`      → "No data found" is correct - EOAs don't have deployment`);
      } else {
        console.log(`   🎯 Conclusion: This IS a contract!`);
        console.log(`      → "No data found" means Etherscan doesn't have creation data`);
        console.log(`      → Possible reasons:`);
        console.log(`         - Contract created via CREATE2 or factory`);
        console.log(`         - Old contract before Etherscan indexing`);
        console.log(`         - Cross-chain deployment`);
      }
      
    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }
    
    await new Promise(r => setTimeout(r, 1500));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY\n');
  console.log('Key findings:');
  console.log('1. "No data found" can mean:');
  console.log('   - Address is an EOA (no contract code)');
  console.log('   - Address is a contract but Etherscan has no creation data');
  console.log('');
  console.log('2. To distinguish:');
  console.log('   - Use eth_getCode to check if address has bytecode');
  console.log('   - If code exists → Contract without indexed creation');
  console.log('   - If no code → EOA (never had deployment)');
  console.log('');
  console.log('3. Recommendation:');
  console.log('   - Always check eth_getCode before treating as contract');
  console.log('   - EOAs should be excluded from contract tracking');
  console.log('   - Contracts without creation data → use first_seen');
}

checkIfEOA()
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });
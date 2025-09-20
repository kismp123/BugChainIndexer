#!/usr/bin/env node
/**
 * Analyze cases where deployment time retrieval fails (NOTOK)
 */

const axios = require('axios');
require('dotenv').config();

async function analyzeDeploymentTimeFailures() {
  const apiKey = process.env.DEFAULT_ETHERSCAN_KEYS.split(',')[0];
  
  console.log('🔍 Analyzing Deployment Time Retrieval Failures\n');
  console.log('='.repeat(60));
  
  const testCases = [
    {
      name: '1. EOA Address (Not a Contract)',
      chainId: 1,
      address: '0x0000000000000000000000000000000000000001',
      expectedFailure: 'No data found - not a contract'
    },
    {
      name: '2. Very Old Contract (Pre-Etherscan)',
      chainId: 1,
      address: '0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643', // cDAI (old)
      expectedFailure: 'Might have data or not'
    },
    {
      name: '3. Contract on Unsupported Network',
      chainId: 999,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      expectedFailure: 'Invalid chain ID'
    },
    {
      name: '4. Self-Destructed Contract',
      chainId: 1,
      address: '0x863DF6BFa4469f3ead0bE8f9F2AAE51c91A907b4', // Example destroyed contract
      expectedFailure: 'May have creation data despite destruction'
    },
    {
      name: '5. Proxy Contract',
      chainId: 1,
      address: '0x7d2768dE32b0b80b7a3454c06BdAc94A69DDc7A9', // Aave V2 Proxy
      expectedFailure: 'Should have creation data'
    },
    {
      name: '6. Create2 Deployed Contract',
      chainId: 1,
      address: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // Uniswap V3 Factory
      expectedFailure: 'Should have creation data'
    },
    {
      name: '7. Genesis/Precompiled Contract',
      chainId: 10, // Optimism
      address: '0x4200000000000000000000000000000000000006', // WETH on Optimism
      expectedFailure: 'Might return GENESIS tx hash'
    },
    {
      name: '8. Recently Deployed Contract',
      chainId: 1,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC (should work)
      expectedFailure: 'Should succeed'
    }
  ];
  
  console.log('Testing getcontractcreation API for various scenarios:\n');
  
  for (const test of testCases) {
    console.log(`📋 ${test.name}`);
    console.log(`   Address: ${test.address}`);
    console.log(`   Chain ID: ${test.chainId}`);
    
    try {
      // Step 1: Try getcontractcreation
      const creationResponse = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          module: 'contract',
          action: 'getcontractcreation',
          contractaddresses: test.address,
          chainid: test.chainId,
          apikey: apiKey
        },
        timeout: 5000
      });
      
      const status = creationResponse.data.status;
      const message = creationResponse.data.message || '';
      const result = creationResponse.data.result;
      
      if (status === '1' && result && result.length > 0) {
        const creation = result[0];
        console.log(`   ✅ Creation data found:`);
        console.log(`      TX Hash: ${creation.txHash}`);
        console.log(`      Creator: ${creation.contractCreator}`);
        console.log(`      Block: ${creation.blockNumber}`);
        
        // Step 2: Try to get timestamp (what our code does)
        if (creation.txHash && !creation.txHash.startsWith('GENESIS')) {
          try {
            const txResponse = await axios.get('https://api.etherscan.io/v2/api', {
              params: {
                module: 'proxy',
                action: 'eth_getTransactionByHash',
                txhash: creation.txHash,
                chainid: test.chainId,
                apikey: apiKey
              },
              timeout: 5000
            });
            
            if (txResponse.data.result && txResponse.data.result.blockNumber) {
              console.log(`      ✅ TX data retrieved`);
              
              // Step 3: Get block timestamp
              const blockResponse = await axios.get('https://api.etherscan.io/v2/api', {
                params: {
                  module: 'proxy',
                  action: 'eth_getBlockByNumber',
                  tag: txResponse.data.result.blockNumber,
                  boolean: false,
                  chainid: test.chainId,
                  apikey: apiKey
                },
                timeout: 5000
              });
              
              if (blockResponse.data.result && blockResponse.data.result.timestamp) {
                const timestamp = parseInt(blockResponse.data.result.timestamp, 16);
                const date = new Date(timestamp * 1000);
                console.log(`      ✅ Timestamp: ${timestamp} (${date.toISOString()})`);
              } else {
                console.log(`      ❌ Block timestamp not found`);
              }
            } else {
              console.log(`      ❌ Transaction data not found`);
            }
          } catch (txError) {
            console.log(`      ❌ Failed to get tx/block data: ${txError.message}`);
          }
        } else if (creation.txHash && creation.txHash.startsWith('GENESIS')) {
          console.log(`      ⚠️  Genesis contract (${creation.txHash})`);
        }
      } else {
        console.log(`   ❌ NOTOK: ${message}`);
        console.log(`   Expected: ${test.expectedFailure}`);
      }
      
    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
    }
    
    console.log('');
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('='.repeat(60));
  console.log('📊 DEPLOYMENT TIME FAILURE ANALYSIS\n');
  
  console.log('Common NOTOK scenarios for deployment time:');
  console.log('');
  console.log('1. **EOA Address (Most Common)**');
  console.log('   - Message: "No data found"');
  console.log('   - Not a contract, no deployment to track');
  console.log('   - Solution: Check if address is contract first');
  console.log('');
  console.log('2. **Contract Not Indexed**');
  console.log('   - Message: "No data found"');
  console.log('   - Very old contracts before Etherscan indexing');
  console.log('   - Contracts on testnets with limited history');
  console.log('   - Solution: Use first_seen as fallback');
  console.log('');
  console.log('3. **Invalid Chain ID**');
  console.log('   - Message: "Missing or unsupported chainid"');
  console.log('   - Network not supported by V2 API');
  console.log('   - Solution: Check supported chains first');
  console.log('');
  console.log('4. **Genesis/Precompiled Contracts**');
  console.log('   - Returns "GENESIS_" prefixed tx hash');
  console.log('   - No actual deployment transaction');
  console.log('   - Solution: Use network genesis timestamp');
  console.log('');
  console.log('5. **Rate Limiting**');
  console.log('   - Message: "Max rate limit reached"');
  console.log('   - Too many API calls (3 calls per contract)');
  console.log('   - Solution: Multiple API keys, caching, delays');
  console.log('');
  console.log('6. **API Key Issues**');
  console.log('   - Message: "Invalid API Key"');
  console.log('   - Expired, revoked, or invalid key');
  console.log('   - Solution: Validate and rotate keys');
  
  console.log('\n🔧 RECOMMENDED FIXES:');
  console.log('1. Check if address is contract before querying');
  console.log('2. Cache successful results to reduce API calls');
  console.log('3. Use first_seen as fallback when deployment unavailable');
  console.log('4. Handle GENESIS contracts specially');
  console.log('5. Implement exponential backoff for rate limits');
}

analyzeDeploymentTimeFailures()
  .then(() => {
    console.log('\n✅ Analysis completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Analysis failed:', error);
    process.exit(1);
  });
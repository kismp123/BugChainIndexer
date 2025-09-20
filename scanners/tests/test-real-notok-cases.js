#!/usr/bin/env node
/**
 * Test real NOTOK cases from database where deployed time couldn't be retrieved
 * These are actual addresses that failed to get deployment timestamps
 */

const axios = require('axios');
require('dotenv').config();

async function testRealNOTOKCases() {
  const apiKey = process.env.DEFAULT_ETHERSCAN_KEYS.split(',')[0];
  
  console.log('🔍 Testing Real NOTOK Cases from Database\n');
  console.log('='.repeat(60));
  
  // These are ACTUAL cases from the production database where deployed was NULL/0
  // Retrieved via SSH on 2025-09-19
  const realCases = [
    // Optimism cases (actual addresses with deployed=NULL/0)
    {
      address: '0x1feb00f463940bb85958a94bd45f1ab58d4afd36',
      chainId: 10,
      network: 'Optimism',
      firstSeen: 1758243607,
      description: 'Real Optimism contract (deployed=NULL)'
    },
    {
      address: '0x244f80d56a33809351139a5b13abcac12162113c',
      chainId: 10,
      network: 'Optimism',
      firstSeen: 1758243607,
      description: 'Real Optimism contract (deployed=NULL)'
    },
    {
      address: '0xa0c6d993679fbb005bbef31b9f9daeecf2474f97',
      chainId: 10,
      network: 'Optimism',
      firstSeen: 1758243607,
      description: 'Real Optimism contract (deployed=NULL)'
    },
    {
      address: '0x58c80aeb6dfcde6324994f7a949acb7669250cbd',
      chainId: 10,
      network: 'Optimism',
      firstSeen: 1758243607,
      description: 'Real Optimism contract (deployed=NULL)'
    },
    {
      address: '0xfa8deeb3e47674468f74f65c3a015c8a5b6eeb99',
      chainId: 10,
      network: 'Optimism',
      firstSeen: 1758243607,
      description: 'Real Optimism contract (deployed=NULL)'
    },
    
    // Arbitrum cases (actual addresses with deployed=NULL/0)
    {
      address: '0xccc1652fbf5b7d6453c25d3a14469d0f7a66d8ef',
      chainId: 42161,
      network: 'Arbitrum',
      firstSeen: 1758243607,
      description: 'Real Arbitrum contract (deployed=NULL)'
    },
    {
      address: '0x493ceafc6d8d8cb07c9d85842eccd06ee6f3b518',
      chainId: 42161,
      network: 'Arbitrum',
      firstSeen: 1758243607,
      description: 'Real Arbitrum contract (deployed=NULL)'
    },
    {
      address: '0x3403338c6f9e63ba57df8be093f2ca63a2e09c1b',
      chainId: 42161,
      network: 'Arbitrum',
      firstSeen: 1758243607,
      description: 'Real Arbitrum contract (deployed=NULL)'
    },
    {
      address: '0xb7f17a6074d30603032de01367365468de39607c',
      chainId: 42161,
      network: 'Arbitrum',
      firstSeen: 1758243607,
      description: 'Real Arbitrum contract (deployed=NULL)'
    },
    {
      address: '0x891034e8cad005d87a46f12828642caac4b88ad6',
      chainId: 42161,
      network: 'Arbitrum',
      firstSeen: 1758243607,
      description: 'Real Arbitrum contract (deployed=NULL)'
    },
    
    // More real addresses from database
    {
      address: '0xa1f4f07066d688cff81e889d30fdadd433f6ecb0',
      chainId: 10,
      network: 'Optimism',
      firstSeen: 1758243607,
      description: 'Real Optimism contract (deployed=NULL)'
    },
    {
      address: '0x2f62082b9a5b4bd06f9ebd4d06c9915f724c906b',
      chainId: 42161,
      network: 'Arbitrum',
      firstSeen: 1758243607,
      description: 'Real Arbitrum contract (deployed=NULL)'
    },
    {
      address: '0xfaf8af1344d6df4795fd489702236b55a7e763fb',
      chainId: 42161,
      network: 'Arbitrum',
      firstSeen: 1758243607,
      description: 'Real Arbitrum contract (deployed=NULL)'
    }
  ];
  
  const results = {
    success: [],
    noData: [],
    error: [],
    genesis: []
  };
  
  console.log(`Testing ${realCases.length} addresses that had NULL/0 deployed times:\n`);
  
  for (const testCase of realCases) {
    console.log(`\n📋 Testing: ${testCase.description}`);
    console.log(`   Network: ${testCase.network} (Chain ${testCase.chainId})`);
    console.log(`   Address: ${testCase.address}`);
    
    try {
      // Try V2 API
      const response = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          module: 'contract',
          action: 'getcontractcreation',
          contractaddresses: testCase.address,
          chainid: testCase.chainId,
          apikey: apiKey
        },
        timeout: 5000
      });
      
      const status = response.data.status;
      const message = response.data.message || '';
      const result = response.data.result;
      
      if (status === '1' && result && result.length > 0) {
        const creation = result[0];
        
        if (creation.txHash && creation.txHash.startsWith('GENESIS')) {
          console.log(`   ⚠️  GENESIS contract - ${creation.txHash}`);
          results.genesis.push(testCase);
        } else {
          console.log(`   ✅ Deployment found:`);
          console.log(`      TX: ${creation.txHash}`);
          console.log(`      Block: ${creation.blockNumber}`);
          results.success.push(testCase);
        }
      } else {
        const isNoData = message.toLowerCase().includes('no data found') || 
                        message.toLowerCase().includes('no records found');
        
        if (isNoData) {
          console.log(`   ℹ️  No deployment data found (${message})`);
          results.noData.push(testCase);
        } else {
          console.log(`   ❌ API Error: ${message}`);
          results.error.push(testCase);
        }
      }
      
    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
      results.error.push(testCase);
    }
    
    // Rate limit delay
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Analysis
  console.log('\n' + '='.repeat(60));
  console.log('📊 ANALYSIS OF REAL NOTOK CASES\n');
  
  console.log(`Total tested: ${realCases.length}`);
  console.log(`✅ Successful: ${results.success.length}`);
  console.log(`ℹ️  No data found: ${results.noData.length}`);
  console.log(`⚠️  Genesis contracts: ${results.genesis.length}`);
  console.log(`❌ API errors: ${results.error.length}`);
  
  if (results.noData.length > 0) {
    console.log('\n📝 Contracts with NO DATA FOUND:');
    results.noData.forEach(c => {
      console.log(`  - ${c.description} (${c.network})`);
    });
  }
  
  if (results.genesis.length > 0) {
    console.log('\n📝 Genesis Contracts:');
    results.genesis.forEach(c => {
      console.log(`  - ${c.description} (${c.network})`);
    });
  }
  
  if (results.error.length > 0) {
    console.log('\n📝 API Errors:');
    results.error.forEach(c => {
      console.log(`  - ${c.description} (${c.network})`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('🎯 CONCLUSIONS FOR DATABASE DEPLOYED=NULL/0 CASES:\n');
  
  console.log('1. **Genesis/System Contracts (0x4200... on L2s)**');
  console.log('   - Return GENESIS_xxx as txHash');
  console.log('   - No actual deployment transaction');
  console.log('   - Should use network genesis timestamp\n');
  
  console.log('2. **Bridge/Canonical Tokens**');
  console.log('   - Often deployed via special mechanisms');
  console.log('   - May not have standard creation data');
  console.log('   - Should fallback to first_seen\n');
  
  console.log('3. **Recently Deployed Contracts**');
  console.log('   - May take time for Etherscan to index');
  console.log('   - Retry after some time might succeed');
  console.log('   - Use first_seen as temporary value\n');
  
  console.log('4. **Cross-chain Deployed Contracts**');
  console.log('   - Contracts deployed via bridges');
  console.log('   - May not have on-chain creation tx');
  console.log('   - first_seen is best approximation\n');
  
  console.log('✅ RECOMMENDED SOLUTION:');
  console.log('When deployed time cannot be retrieved (NOTOK):');
  console.log('1. Check if GENESIS contract → use network genesis time');
  console.log('2. Check if "No data found" → use first_seen as fallback');
  console.log('3. For other errors → retry later, use first_seen temporarily');
}

testRealNOTOKCases()
  .then(() => {
    console.log('\n✅ Analysis completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Analysis failed:', error);
    process.exit(1);
  });
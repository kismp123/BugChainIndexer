#!/usr/bin/env node
/**
 * Test deployment time retrieval for top funded addresses
 */

const axios = require('axios');
require('dotenv').config();

async function testTopFundedDeployed() {
  const apiKey = process.env.DEFAULT_ETHERSCAN_KEYS.split(',')[0];
  
  console.log('🔍 Testing Deployment Time for Top Funded Addresses\n');
  console.log('='.repeat(60));
  
  const topAddresses = [
    { address: '0x0000000000000000000000000000000000001004', network: 'binance', chainId: 56, fund: 25961180753 },
    { address: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0', network: 'ethereum', chainId: 1, fund: 16746092949 },
    { address: '0xcd5fe23c85820f7b72d0926fc9b05b43e359b7ee', network: 'ethereum', chainId: 1, fund: 11900099320 },
    { address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', network: 'ethereum', chainId: 1, fund: 10898666769 },
    { address: '0xbdfa7b7893081b35fb54027489e2bc7a38275129', network: 'ethereum', chainId: 1, fund: 8431033967 },
    { address: '0xc01cde799245a25e6eabc550b36a47f6f83cc0f1', network: 'ethereum', chainId: 1, fund: 5949983473 },
    { address: '0x9d39a5de30e57443bff2a8307a4256c8797a3497', network: 'ethereum', chainId: 1, fund: 5568318032 },
    { address: '0x5ee5bf7ae06d1be5997a1a72006fe6c607ec6de8', network: 'ethereum', chainId: 1, fund: 4633459601 },
    { address: '0x0b925ed163218f6662a35e0f0371ac234f9e9371', network: 'ethereum', chainId: 1, fund: 4534784151 },
    { address: '0x93c4b944d05dfe6df7645a86cd2206016c51564d', network: 'ethereum', chainId: 1, fund: 4297593667 }
  ];
  
  const results = {
    success: [],
    genesis: [],
    noData: [],
    error: []
  };
  
  for (const item of topAddresses) {
    console.log(`\n📋 Testing #${topAddresses.indexOf(item) + 1}: ${item.address.substring(0, 10)}...`);
    console.log(`   Network: ${item.network} (Chain ${item.chainId})`);
    console.log(`   Fund: ${item.fund.toLocaleString()}`);
    
    try {
      // First check if it's a contract
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
      
      if (!hasCode) {
        console.log(`   ❌ Not a contract (EOA)`);
        results.noData.push(item);
        continue;
      }
      
      // Try to get deployment time
      const creationResponse = await axios.get('https://api.etherscan.io/v2/api', {
        params: {
          module: 'contract',
          action: 'getcontractcreation',
          contractaddresses: item.address,
          chainid: item.chainId,
          apikey: apiKey
        },
        timeout: 5000
      });
      
      const status = creationResponse.data.status;
      const message = creationResponse.data.message || '';
      const result = creationResponse.data.result;
      
      if (status === '1' && result && result.length > 0) {
        const creation = result[0];
        
        if (creation.txHash && creation.txHash.startsWith('GENESIS')) {
          console.log(`   ⚠️  GENESIS contract`);
          console.log(`      TX: ${creation.txHash}`);
          results.genesis.push({ ...item, txHash: creation.txHash });
        } else if (creation.txHash) {
          console.log(`   ✅ Deployment found`);
          console.log(`      TX: ${creation.txHash}`);
          console.log(`      Block: ${creation.blockNumber}`);
          
          // Get timestamp
          try {
            const txResponse = await axios.get('https://api.etherscan.io/v2/api', {
              params: {
                module: 'proxy',
                action: 'eth_getTransactionByHash',
                txhash: creation.txHash,
                chainid: item.chainId,
                apikey: apiKey
              },
              timeout: 5000
            });
            
            if (txResponse.data.result && txResponse.data.result.blockNumber) {
              const blockResponse = await axios.get('https://api.etherscan.io/v2/api', {
                params: {
                  module: 'proxy',
                  action: 'eth_getBlockByNumber',
                  tag: txResponse.data.result.blockNumber,
                  boolean: false,
                  chainid: item.chainId,
                  apikey: apiKey
                },
                timeout: 5000
              });
              
              if (blockResponse.data.result && blockResponse.data.result.timestamp) {
                const timestamp = parseInt(blockResponse.data.result.timestamp, 16);
                const date = new Date(timestamp * 1000);
                console.log(`      Deployed: ${date.toISOString()}`);
                results.success.push({ ...item, deployedAt: timestamp });
              }
            }
          } catch (txError) {
            console.log(`      ⚠️  Failed to get timestamp: ${txError.message}`);
          }
        }
      } else {
        const isNoData = message.toLowerCase().includes('no data found');
        if (isNoData) {
          console.log(`   ℹ️  No deployment data (${message})`);
          results.noData.push(item);
        } else {
          console.log(`   ❌ Error: ${message}`);
          results.error.push(item);
        }
      }
      
    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
      results.error.push(item);
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY\n');
  
  console.log(`Total tested: ${topAddresses.length}`);
  console.log(`✅ Success: ${results.success.length}`);
  console.log(`⚠️  Genesis: ${results.genesis.length}`);
  console.log(`ℹ️  No data: ${results.noData.length}`);
  console.log(`❌ Errors: ${results.error.length}`);
  
  if (results.genesis.length > 0) {
    console.log('\n🔥 Genesis Contracts Found:');
    results.genesis.forEach(item => {
      console.log(`  - ${item.address} (${item.network}) - ${item.txHash}`);
    });
  }
  
  if (results.success.length > 0) {
    console.log('\n✅ Successfully Retrieved:');
    results.success.forEach(item => {
      const date = new Date(item.deployedAt * 1000);
      console.log(`  - ${item.address} deployed at ${date.toISOString()}`);
    });
  }
}

testTopFundedDeployed()
  .then(() => {
    console.log('\n✅ Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
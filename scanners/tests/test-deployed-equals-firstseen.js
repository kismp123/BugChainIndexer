#!/usr/bin/env node
/**
 * Test deployment time for addresses where deployed = first_seen
 * These are likely fallback values, let's check their real deployment times
 */

const axios = require('axios');
require('dotenv').config();

async function testDeployedEqualsFirstSeen() {
  const apiKey = process.env.DEFAULT_ETHERSCAN_KEYS.split(',')[0];
  
  console.log('🔍 Testing Addresses where deployed = first_seen\n');
  console.log('These likely used first_seen as fallback - checking real deployment times');
  console.log('='.repeat(60));
  
  const addresses = [
    { address: '0x73b4b4e5e2dcf450dc3f55cb74819b2c8a420e31', network: 'polygon', chainId: 137, fund: 0, deployed: 1756213802, first_seen: 1756213802 },
    { address: '0x2156c19172f82cb96545e9ddcef9e98ed4cbed19', network: 'base', chainId: 8453, fund: 0, deployed: 1756104602, first_seen: 1756104602 },
    { address: '0x13d46f63dc18566f9a679d0c4d75ce0ef9efb175', network: 'base', chainId: 8453, fund: 0, deployed: 1756104602, first_seen: 1756104602 },
    { address: '0xa59ec7c2923a96ef533d54aeb343e7aae6875b80', network: 'base', chainId: 8453, fund: 0, deployed: 1756104602, first_seen: 1756104602 },
    { address: '0x0fd3bea37dc680c66f4f16c9d99dbeb634652a0a', network: 'polygon', chainId: 137, fund: 0, deployed: 1756213802, first_seen: 1756213802 },
    { address: '0xbd9211b57deaa0a259d2b3a98f9cefb881a854a6', network: 'base', chainId: 8453, fund: 0, deployed: 1756519203, first_seen: 1756519203 },
    { address: '0x1b2ccee8207125cbb6aade31428f50b1802e4541', network: 'base', chainId: 8453, fund: 0, deployed: 1756104602, first_seen: 1756104602 },
    { address: '0x8189642186e50006b2d92dbd1a537526ba69aa5f', network: 'base', chainId: 8453, fund: 0, deployed: 1756104602, first_seen: 1756104602 },
    { address: '0xe75634255b70a77db09f3ba05ad198c3e98d74d7', network: 'base', chainId: 8453, fund: 0, deployed: 1756519203, first_seen: 1756519203 },
    { address: '0xdada0edcaf6512109f8d814fa90380ca91181dcd', network: 'base', chainId: 8453, fund: 0, deployed: 1756104602, first_seen: 1756104602 }
  ];
  
  const results = {
    realDeployment: [],
    noData: [],
    genesis: [],
    eoa: []
  };
  
  for (const item of addresses) {
    const firstSeenDate = new Date(item.first_seen * 1000);
    console.log(`\n📋 Testing: ${item.address.substring(0, 10)}...`);
    console.log(`   Network: ${item.network} (Chain ${item.chainId})`);
    console.log(`   Current deployed/first_seen: ${firstSeenDate.toISOString()}`);
    
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
        console.log(`   ⚠️  Should be removed from contract tracking!`);
        results.eoa.push(item);
        continue;
      }
      
      // Try to get real deployment time
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
          console.log(`   ⚠️  GENESIS contract: ${creation.txHash}`);
          results.genesis.push({ ...item, txHash: creation.txHash });
        } else if (creation.txHash) {
          console.log(`   ✅ Real deployment found!`);
          console.log(`      TX: ${creation.txHash}`);
          console.log(`      Block: ${creation.blockNumber}`);
          
          // Get actual timestamp
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
                const realTimestamp = parseInt(blockResponse.data.result.timestamp, 16);
                const realDate = new Date(realTimestamp * 1000);
                const diff = item.first_seen - realTimestamp;
                
                console.log(`      Real deployed: ${realDate.toISOString()}`);
                console.log(`      First seen: ${firstSeenDate.toISOString()}`);
                console.log(`      Difference: ${Math.floor(diff / 86400)} days`);
                
                if (diff > 86400) { // More than 1 day difference
                  console.log(`      🔴 NEEDS UPDATE: Real deployment is earlier!`);
                }
                
                results.realDeployment.push({ 
                  ...item, 
                  realDeployed: realTimestamp,
                  difference: diff 
                });
              }
            }
          } catch (txError) {
            console.log(`      ⚠️  Failed to get timestamp: ${txError.message}`);
          }
        }
      } else {
        const isNoData = message.toLowerCase().includes('no data found');
        if (isNoData) {
          console.log(`   ℹ️  No deployment data available`);
          console.log(`      Using first_seen as fallback is correct`);
          results.noData.push(item);
        } else {
          console.log(`   ❌ API Error: ${message}`);
        }
      }
      
    } catch (error) {
      console.log(`   ❌ Request failed: ${error.message}`);
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 ANALYSIS SUMMARY\n');
  
  console.log(`Total tested: ${addresses.length}`);
  console.log(`✅ Real deployment found: ${results.realDeployment.length}`);
  console.log(`ℹ️  No data (fallback correct): ${results.noData.length}`);
  console.log(`⚠️  Genesis contracts: ${results.genesis.length}`);
  console.log(`❌ EOAs (should remove): ${results.eoa.length}`);
  
  if (results.eoa.length > 0) {
    console.log('\n🚨 EOAs FOUND (Should be removed from contract tracking):');
    results.eoa.forEach(item => {
      console.log(`  - ${item.address} (${item.network})`);
    });
  }
  
  if (results.realDeployment.length > 0) {
    const needsUpdate = results.realDeployment.filter(r => r.difference > 86400);
    if (needsUpdate.length > 0) {
      console.log('\n🔴 Addresses needing deployment time update:');
      needsUpdate.forEach(item => {
        const realDate = new Date(item.realDeployed * 1000);
        const daysDiff = Math.floor(item.difference / 86400);
        console.log(`  - ${item.address} (${item.network})`);
        console.log(`    Real: ${realDate.toISOString()} (${daysDiff} days earlier)`);
      });
    }
  }
  
  console.log('\n📝 CONCLUSION:');
  console.log('When deployed = first_seen, it usually means:');
  console.log('1. No deployment data available from Etherscan (correct fallback)');
  console.log('2. Address is actually an EOA (should be removed)');
  console.log('3. Real deployment exists but was missed (needs update)');
}

testDeployedEqualsFirstSeen()
  .then(() => {
    console.log('\n✅ Analysis completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Analysis failed:', error);
    process.exit(1);
  });
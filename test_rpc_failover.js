#!/usr/bin/env node

// Simple test without external dependencies
const crypto = require('crypto');

// Test RPC endpoints for problematic networks
const testNetworks = {
  avalanche: [
    'https://avalanche-c-chain-rpc.publicnode.com',
    'https://api.avax.network/ext/bc/C/rpc',
    'https://1rpc.io/avax/c'
  ],
  linea: [
    'https://rpc.linea.build',
    'https://1rpc.io/linea',
    'https://linea.drpc.org'
  ],
  mantle: [
    'https://rpc.mantle.xyz',
    'https://mantle-rpc.publicnode.com',
    'https://mantle.drpc.org'
  ],
  opbnb: [
    'https://opbnb-mainnet-rpc.bnbchain.org',
    'https://opbnb-rpc.publicnode.com',
    'https://1rpc.io/opbnb'
  ]
};

// Test addresses for each network (known contracts)
const testAddresses = {
  avalanche: '0xfc421ad3c883bf9e7c4f42de845c4e4405799e73',
  linea: '0x0000000000000000000000000000000000000000',
  mantle: '0x0000000000000000000000000000000000000000',
  opbnb: '0x0000000000000000000000000000000000000000'
};

async function testRpcEndpoint(network, rpcUrl, testAddress) {
  console.log(`\nTesting ${network} RPC: ${rpcUrl}`);
  
  try {
    // Test 1: Basic JSON-RPC call
    const payload = {
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
      id: 1
    };
    
    const response = await axios.post(rpcUrl, payload, {
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: (status) => status < 500
    });
    
    if (response.status === 401 || response.status === 403) {
      console.log(`  ❌ Authentication error: ${response.status} ${response.statusText}`);
      if (response.data?.error) {
        console.log(`     Error details: ${response.data.error}`);
      }
      return false;
    }
    
    if (response.data.error) {
      console.log(`  ❌ RPC Error: ${response.data.error.message}`);
      return false;
    }
    
    const blockNumber = parseInt(response.data.result, 16);
    console.log(`  ✅ Block number: ${blockNumber}`);
    
    // Test 2: Get code for a contract
    if (testAddress !== '0x0000000000000000000000000000000000000000') {
      const codePayload = {
        jsonrpc: '2.0',
        method: 'eth_getCode',
        params: [testAddress, 'latest'],
        id: 2
      };
      
      const codeResponse = await axios.post(rpcUrl, codePayload, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (codeResponse.data.result && codeResponse.data.result !== '0x') {
        const codeHash = '0x' + crypto.createHash('sha256').update(codeResponse.data.result).digest('hex');
        console.log(`  ✅ Contract code hash: ${codeHash}`);
      } else {
        console.log(`  ⚠️  No contract code at address`);
      }
    }
    
    return true;
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('Testing RPC endpoints for problematic networks...\n');
  console.log('=' .repeat(60));
  
  for (const [network, endpoints] of Object.entries(testNetworks)) {
    console.log(`\n🔍 Testing ${network.toUpperCase()} network:`);
    console.log('-'.repeat(40));
    
    const testAddress = testAddresses[network];
    let workingEndpoints = [];
    
    for (const endpoint of endpoints) {
      const isWorking = await testRpcEndpoint(network, endpoint, testAddress);
      if (isWorking) {
        workingEndpoints.push(endpoint);
      }
    }
    
    console.log(`\n📊 Summary for ${network}:`);
    console.log(`   Working endpoints: ${workingEndpoints.length}/${endpoints.length}`);
    if (workingEndpoints.length > 0) {
      console.log(`   ✅ Recommended primary: ${workingEndpoints[0]}`);
    } else {
      console.log(`   ⚠️  No working endpoints found!`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Testing complete!');
}

// Run the test
main().catch(console.error);
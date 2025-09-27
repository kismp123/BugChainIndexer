// Test Alchemy RPC integration
const { HttpRpcClient } = require('../common/core');
const CONFIG = require('../config/networks');

async function testAlchemyRPC() {
  console.log('🔍 Testing Alchemy RPC Integration\n');
  
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (!alchemyKey) {
    console.log('❌ ALCHEMY_API_KEY not found in environment');
    return;
  }
  
  console.log('✅ Alchemy API Key found:', alchemyKey.substring(0, 10) + '...\n');
  
  // Networks that support Alchemy
  const alchemyNetworks = ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'];
  
  for (const network of alchemyNetworks) {
    console.log(`\n📊 Testing ${network}...`);
    
    const config = CONFIG.NETWORKS[network];
    if (!config) {
      console.log(`  ❌ Network config not found`);
      continue;
    }
    
    // Check if Alchemy URL is in RPC URLs
    const alchemyUrl = config.rpcUrls.find(url => url.includes('alchemy.com'));
    if (!alchemyUrl) {
      console.log(`  ⚠️  No Alchemy URL found in RPC list`);
      continue;
    }
    
    console.log(`  ✅ Alchemy URL: ${alchemyUrl.substring(0, 50)}...`);
    
    // Test the RPC connection
    try {
      const rpc = new HttpRpcClient(network);
      
      // Test 1: Get block number
      const blockNumber = await rpc.getBlockNumber();
      console.log(`  ✅ Block number: ${blockNumber}`);
      
      // Test 2: Get chain ID
      const chainId = await rpc.send('eth_chainId', []);
      const chainIdDec = parseInt(chainId, 16);
      console.log(`  ✅ Chain ID: ${chainIdDec} (expected: ${config.chainId})`);
      
      // Test 3: Get gas price
      const gasPrice = await rpc.send('eth_gasPrice', []);
      const gasPriceGwei = Math.round(parseInt(gasPrice, 16) / 1e9);
      console.log(`  ✅ Gas price: ${gasPriceGwei} Gwei`);
      
      // Test 4: Check a random address code (for contract detection)
      const testAddress = '0x0000000000000000000000000000000000000001';
      const code = await rpc.getCode(testAddress);
      console.log(`  ✅ getCode works: ${code === '0x' ? 'EOA' : 'Contract'}`);
      
      console.log(`  ✅ ${network} Alchemy RPC is working!`);
      
    } catch (error) {
      console.log(`  ❌ Error testing RPC: ${error.message}`);
    }
  }
  
  console.log('\n✅ Alchemy RPC integration test completed');
}

// Run test
testAlchemyRPC().catch(console.error);
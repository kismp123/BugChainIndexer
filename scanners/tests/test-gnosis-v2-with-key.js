/**
 * Test Gnosis Network with V2 API using specific API key
 */

const axios = require('axios');

const API_KEY = '964G8PEYWFX6MXG8IW9JMBFM9TP4UTW6VI';
const GNOSIS_CHAIN_ID = 100;

// Test contracts
const TEST_CONTRACTS = [
  {
    address: '0x9C58BAcC331c9aa871AFD802DB6379a98e80CEdb',
    name: 'GNO Token',
    description: 'GnosisDAO Token'
  },
  {
    address: '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d',
    name: 'WXDAI',
    description: 'Wrapped XDAI'
  },
  {
    address: '0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83',
    name: 'USDC',
    description: 'USD Coin on Gnosis'
  }
];

async function testV2API(testData) {
  console.log('\n' + '-'.repeat(80));
  console.log('Testing: ' + testData.description);
  console.log('Address: ' + testData.address);
  console.log('-'.repeat(80));

  try {
    const url = 'https://api.etherscan.io/v2/api';
    const params = {
      chainid: GNOSIS_CHAIN_ID,
      module: 'contract',
      action: 'getsourcecode',
      address: testData.address,
      apikey: API_KEY
    };

    console.log('Request: ' + url);
    console.log('Params: chainid=' + GNOSIS_CHAIN_ID + ', address=' + testData.address);

    const response = await axios.get(url, {
      params,
      timeout: 15000
    });

    const data = response.data;

    console.log('Response status: ' + data.status);
    console.log('Response message: ' + data.message);

    if (!data || data.status !== '1') {
      const errorMsg = data.message || 'Unknown error';
      console.log('❌ API Error: ' + errorMsg);
      console.log('   Result: ' + JSON.stringify(data.result).substring(0, 200));
      return {
        address: testData.address,
        success: false,
        error: errorMsg,
        rawResponse: data
      };
    }

    const sourceData = data.result[0];

    if (!sourceData || !sourceData.SourceCode || sourceData.SourceCode === '') {
      console.log('⚠️  Contract not verified');
      return {
        address: testData.address,
        success: false,
        error: 'Not verified'
      };
    }

    console.log('✅ SUCCESS - Contract Verified via V2 API!');
    console.log('   Contract Name: ' + sourceData.ContractName);
    console.log('   Expected: ' + testData.name);
    console.log('   Compiler: ' + sourceData.CompilerVersion);
    console.log('   License: ' + (sourceData.LicenseType || 'None'));
    console.log('   Source Code Length: ' + sourceData.SourceCode.length + ' chars');

    return {
      address: testData.address,
      success: true,
      contractName: sourceData.ContractName,
      expected: testData.name,
      verified: true
    };

  } catch (error) {
    console.log('❌ FAILED - ' + error.message);
    if (error.response) {
      console.log('   HTTP Status: ' + error.response.status);
      console.log('   Response: ' + JSON.stringify(error.response.data).substring(0, 200));
    }
    return {
      address: testData.address,
      success: false,
      error: error.message
    };
  }
}

async function runTests() {
  console.log('='.repeat(80));
  console.log('🧪 GNOSIS - V2 API TEST WITH SPECIFIC KEY');
  console.log('='.repeat(80));
  console.log('\nAPI Key: ' + API_KEY.substring(0, 10) + '...' + API_KEY.substring(API_KEY.length - 4));
  console.log('Chain ID: ' + GNOSIS_CHAIN_ID);
  console.log('Endpoint: https://api.etherscan.io/v2/api\n');

  const results = [];

  for (const testData of TEST_CONTRACTS) {
    const result = await testV2API(testData);
    results.push(result);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 RESULTS SUMMARY');
  console.log('='.repeat(80));

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log('\n✅ Successful: ' + successful.length + '/' + results.length);
  console.log('❌ Failed: ' + failed.length + '/' + results.length);

  if (successful.length > 0) {
    console.log('\n✅ VERIFIED CONTRACTS:');
    successful.forEach(r => {
      console.log('   ✓ ' + r.address + ' - ' + r.contractName);
    });
  }

  if (failed.length > 0) {
    console.log('\n❌ FAILED CONTRACTS:');
    failed.forEach(r => {
      console.log('   ✗ ' + r.address + ' - ' + r.error);
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('💡 CONCLUSION');
  console.log('='.repeat(80));

  if (successful.length > 0) {
    console.log('\n✅ V2 API WORKS for Gnosis with this key!');
    console.log('   ' + successful.length + '/' + results.length + ' contracts verified successfully');
    console.log('\n   Recommendation: Use V2 API for Gnosis');
  } else {
    console.log('\n❌ V2 API NOT WORKING for Gnosis');
    console.log('   All test contracts failed');
    if (failed.length > 0 && failed[0].error) {
      console.log('\n   Common error: ' + failed[0].error);
    }
  }

  console.log('\n' + '='.repeat(80));

  return successful.length > 0;
}

// Run tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n❌ Unexpected error:', error);
    process.exit(1);
  });

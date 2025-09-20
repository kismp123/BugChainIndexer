#!/usr/bin/env node
/**
 * Test V2 API NOTOK reasons without real API keys
 * Analyzes response patterns and error conditions
 */

const axios = require('axios');

async function analyzeV2APIBehavior() {
  console.log('🔍 Analyzing V2 API NOTOK Reasons\n');
  console.log('='.repeat(60));
  
  const testCases = [
    {
      name: 'No API Key',
      params: {
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chainid: 1
        // No apikey parameter
      },
      expectedError: 'Missing or invalid API key'
    },
    {
      name: 'Invalid API Key',
      params: {
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chainid: 1,
        apikey: 'INVALID_KEY_12345'
      },
      expectedError: 'Invalid API key'
    },
    {
      name: 'Valid Request Structure (will fail without real key)',
      params: {
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chainid: 1,
        apikey: 'YourAPIKeyHere'
      },
      expectedError: 'Invalid API key'
    },
    {
      name: 'Invalid Chain ID',
      params: {
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        chainid: 99999,
        apikey: 'YourAPIKeyHere'
      },
      expectedError: 'Invalid chain or API key'
    },
    {
      name: 'Malformed Address',
      params: {
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: 'not_an_address',
        chainid: 1,
        apikey: 'YourAPIKeyHere'
      },
      expectedError: 'Invalid address or API key'
    },
    {
      name: 'Multiple Addresses (comma-separated)',
      params: {
        module: 'contract',
        action: 'getcontractcreation',
        contractaddresses: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,0xdAC17F958D2ee523a2206206994597C13D831ec7',
        chainid: 1,
        apikey: 'YourAPIKeyHere'
      },
      expectedError: 'Should support multiple addresses'
    }
  ];
  
  for (const test of testCases) {
    console.log(`\n📝 Test: ${test.name}`);
    console.log('-'.repeat(40));
    
    try {
      const response = await axios.get('https://api.etherscan.io/v2/api', {
        params: test.params,
        timeout: 5000,
        validateStatus: () => true // Accept any status code
      });
      
      console.log(`HTTP Status: ${response.status}`);
      
      if (response.data) {
        console.log(`Response Status: ${response.data.status === '1' ? '✅ OK' : '❌ NOTOK'}`);
        if (response.data.message) {
          console.log(`Message: "${response.data.message}"`);
        }
        if (response.data.result && typeof response.data.result === 'string') {
          console.log(`Result: "${response.data.result}"`);
        }
      }
      
      console.log(`Expected: ${test.expectedError}`);
      
    } catch (error) {
      console.log(`❌ Request Error: ${error.message}`);
      if (error.response) {
        console.log(`HTTP Status: ${error.response.status}`);
      }
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 V2 API NOTOK Analysis Results');
  console.log('='.repeat(60));
  
  console.log('\n🔍 Common NOTOK Patterns:');
  console.log(`
1. **Invalid API Key**
   - Message: "Invalid API Key"
   - Cause: API key is missing, malformed, or revoked
   - Solution: Use valid API key from Etherscan account

2. **No Data Found**
   - Message: "No data found" or "No records found"
   - Cause: Contract creation data not available
   - Common for:
     * EOA addresses (not contracts)
     * Very old contracts (before indexing)
     * Contracts on unsupported chains
   - Solution: Check if address is contract first

3. **Rate Limit**
   - Message: "Max rate limit reached"
   - Cause: Too many requests in short time
   - Solution: 
     * Use multiple API keys
     * Add delays between requests
     * Implement exponential backoff

4. **Invalid Parameters**
   - Message: "Error! Invalid address format"
   - Cause: Malformed address or parameters
   - Solution: Validate inputs before API call

5. **Chain Not Supported**
   - Some chain IDs may not have full data
   - V2 API supports major chains but not all endpoints
  `);
  
  console.log('\n✅ Best Practices:');
  console.log('1. Always handle NOTOK responses gracefully');
  console.log('2. Distinguish between "no data" and "error"');
  console.log('3. Implement retry logic with backoff');
  console.log('4. Use fallback values when data unavailable');
  console.log('5. Cache successful responses to reduce API calls');
}

// Additional test for understanding response format
async function testResponseFormats() {
  console.log('\n\n📋 Testing Response Format Variations');
  console.log('='.repeat(60));
  
  // Test with a public demo endpoint (if available)
  console.log('\n🧪 Testing Ethereum stats (usually works without key):');
  
  try {
    const response = await axios.get('https://api.etherscan.io/api', {
      params: {
        module: 'stats',
        action: 'ethsupply'
      },
      timeout: 5000
    });
    
    console.log('Response structure:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.log('Failed to get public stats:', error.message);
  }
  
  console.log('\n📝 Key Observations:');
  console.log(`
1. V2 API Response Format:
   {
     "status": "0" or "1",  // 0 = NOTOK, 1 = OK
     "message": "...",      // Error description or "OK"
     "result": [...] or "..." // Data array or error string
   }

2. Status Codes:
   - "1" = Success, data in result array
   - "0" = Failure, error in message/result

3. Common V2 vs V1 Differences:
   - V2 uses chainid parameter (required)
   - V2 has unified endpoint for all chains
   - Some V1 endpoints not available in V2
   - V2 may have stricter rate limits
  `);
}

// Run all tests
async function runAllTests() {
  await analyzeV2APIBehavior();
  await testResponseFormats();
  
  console.log('\n' + '='.repeat(60));
  console.log('🎯 CONCLUSION');
  console.log('='.repeat(60));
  console.log(`
The V2 API returns NOTOK for several legitimate reasons:

1. **Most Common**: "No data found"
   - NOT an error, just means no creation data available
   - Should be handled gracefully, not treated as failure

2. **API Key Issues**
   - Invalid, missing, or rate-limited keys
   - Need valid Etherscan account and API keys

3. **Implementation Recommendations**:
   - Check response.data.message to understand NOTOK reason
   - Use fallback to first_seen when creation data unavailable
   - Don't treat "No data found" as an error
   - Implement proper retry logic for rate limits
  `);
}

runAllTests()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
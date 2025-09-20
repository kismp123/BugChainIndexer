#!/usr/bin/env node
/**
 * Test current API status - Demo and Free
 */

const axios = require('axios');
require('dotenv').config();

async function testCurrentStatus() {
  const apiKey = process.env.DEFAULT_COINGECKO_KEY || '';
  
  console.log('🔍 현재 API 상태 확인\n');
  console.log('='.repeat(80));
  console.log(`API Key: ${apiKey}\n`);
  
  const results = {
    demo: { working: [], failed: [] },
    free: { working: [], failed: [] }
  };
  
  // 1. Demo API 테스트 (헤더 방식)
  console.log('📊 1. Demo API 테스트 (Header 방식)\n');
  
  // Test 1.1: Native token price
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'ethereum', vs_currencies: 'usd' },
      headers: { 'x-cg-demo-api-key': apiKey },
      timeout: 10000
    });
    console.log('   ✅ Native token (ETH): $' + response.data.ethereum.usd);
    results.demo.working.push('Native token price');
  } catch (error) {
    console.log('   ❌ Native token failed:', error.response?.status);
    results.demo.failed.push('Native token price');
  }
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Test 1.2: Token price
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/token_price/ethereum', {
      params: {
        contract_addresses: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        vs_currencies: 'usd'
      },
      headers: { 'x-cg-demo-api-key': apiKey },
      timeout: 10000
    });
    console.log('   ✅ Ethereum USDC: $' + response.data['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'].usd);
    results.demo.working.push('Ethereum token price');
  } catch (error) {
    console.log('   ❌ Ethereum USDC failed:', error.response?.status);
    results.demo.failed.push('Ethereum token price');
  }
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Test 1.3: BSC token
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/token_price/binance-smart-chain', {
      params: {
        contract_addresses: '0x55d398326f99059ff775485246999027b3197955',
        vs_currencies: 'usd'
      },
      headers: { 'x-cg-demo-api-key': apiKey },
      timeout: 10000
    });
    console.log('   ✅ BSC USDT: $' + response.data['0x55d398326f99059ff775485246999027b3197955'].usd);
    results.demo.working.push('BSC token price');
  } catch (error) {
    console.log('   ❌ BSC USDT failed:', error.response?.status);
    results.demo.failed.push('BSC token price');
  }
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Test 1.4: Multiple native tokens
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'ethereum,binancecoin,matic-network', vs_currencies: 'usd' },
      headers: { 'x-cg-demo-api-key': apiKey },
      timeout: 10000
    });
    console.log('   ✅ Multiple natives:', Object.keys(response.data).length + ' tokens');
    results.demo.working.push('Multiple native tokens');
  } catch (error) {
    console.log('   ❌ Multiple natives failed:', error.response?.status);
    results.demo.failed.push('Multiple native tokens');
  }
  
  // 2. Free API 테스트 (키 없이)
  console.log('\n📊 2. Free API 테스트 (No Key)\n');
  
  await new Promise(r => setTimeout(r, 6000)); // Wait for rate limit
  
  // Test 2.1: Native token
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'ethereum', vs_currencies: 'usd' },
      timeout: 10000
    });
    console.log('   ✅ Native token (ETH): $' + response.data.ethereum.usd);
    results.free.working.push('Native token price');
  } catch (error) {
    console.log('   ❌ Native token failed:', error.response?.status);
    results.free.failed.push('Native token price');
  }
  
  await new Promise(r => setTimeout(r, 6000));
  
  // Test 2.2: Token price
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/token_price/ethereum', {
      params: {
        contract_addresses: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        vs_currencies: 'usd'
      },
      timeout: 10000
    });
    console.log('   ✅ Ethereum USDC: $' + response.data['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'].usd);
    results.free.working.push('Token price');
  } catch (error) {
    console.log('   ❌ Ethereum USDC failed:', error.response?.status);
    results.free.failed.push('Token price');
  }
  
  await new Promise(r => setTimeout(r, 6000));
  
  // Test 2.3: Multiple tokens
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: 'ethereum,binancecoin,matic-network', vs_currencies: 'usd' },
      timeout: 10000
    });
    console.log('   ✅ Multiple natives:', Object.keys(response.data).length + ' tokens');
    results.free.working.push('Multiple native tokens');
  } catch (error) {
    console.log('   ❌ Multiple natives failed:', error.response?.status);
    results.free.failed.push('Multiple native tokens');
  }
  
  // 요약
  console.log('\n' + '='.repeat(80));
  console.log('📊 현재 상태 요약\n');
  
  console.log('1️⃣  Demo API (with key as header):');
  console.log(`   ✅ 작동: ${results.demo.working.length}개 기능`);
  if (results.demo.working.length > 0) {
    results.demo.working.forEach(f => console.log(`      - ${f}`));
  }
  if (results.demo.failed.length > 0) {
    console.log(`   ❌ 실패: ${results.demo.failed.length}개 기능`);
    results.demo.failed.forEach(f => console.log(`      - ${f}`));
  }
  
  console.log('\n2️⃣  Free API (no key):');
  console.log(`   ✅ 작동: ${results.free.working.length}개 기능`);
  if (results.free.working.length > 0) {
    results.free.working.forEach(f => console.log(`      - ${f}`));
  }
  if (results.free.failed.length > 0) {
    console.log(`   ❌ 실패: ${results.free.failed.length}개 기능`);
    results.free.failed.forEach(f => console.log(`      - ${f}`));
  }
  
  console.log('\n📋 결론:');
  
  const demoWorks = results.demo.working.length > 0;
  const freeWorks = results.free.working.length > 0;
  
  if (demoWorks && freeWorks) {
    console.log('   ✅ Demo API와 Free API 모두 사용 가능');
    console.log('   - Demo: 일부 기능 제한적 (30 req/min)');
    console.log('   - Free: 모든 기본 기능 작동 (10-30 req/min)');
    console.log('   - 현재 혼합 모드로 최적 성능 구현 중');
  } else if (demoWorks) {
    console.log('   🟡 Demo API만 부분적으로 작동');
  } else if (freeWorks) {
    console.log('   ⚪ Free API만 작동');
  } else {
    console.log('   ❌ 모든 API 실패');
  }
  
  console.log('\n🔧 FundUpdater 현재 설정:');
  console.log('   1. Native tokens: Demo API 우선 시도');
  console.log('   2. Token prices: Demo 실패 시 Free API 폴백');
  console.log('   3. 속도 제한: Demo 2초, Free 6초 지연');
  
  return results;
}

testCurrentStatus()
  .then(results => {
    console.log('\n✅ 테스트 완료');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ 테스트 실패:', error);
    process.exit(1);
  });
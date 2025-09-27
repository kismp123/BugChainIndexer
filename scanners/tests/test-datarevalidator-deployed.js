// Test DataRevalidator deployed field correction
const { Client } = require('pg');

async function testDataRevalidatorDeployed() {
  console.log('🔍 Testing DataRevalidator deployed field corrections\n');
  
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'bugchain_indexer',
    user: 'postgres',
    password: ''
  });
  
  try {
    await client.connect();
    
    // Check current state of problematic addresses
    console.log('📊 Current state of addresses with deployed issues:\n');
    
    const checkQuery = `
      SELECT 
        address,
        deployed,
        TO_TIMESTAMP(deployed) as deployed_date,
        code_hash,
        tags,
        contract_name
      FROM addresses
      WHERE network = 'ethereum'
      AND address IN (
        '0xdac17f958d2ee523a2206206994597c13d831ec7',  -- USDT
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',  -- USDC
        '0x6b175474e89094c44da98b954eedeac495271d0f'   -- DAI
      )
      ORDER BY address
    `;
    
    const result = await client.query(checkQuery);
    
    console.log('Address | Deployed | Tags | Contract Name');
    console.log('--------|----------|------|---------------');
    
    result.rows.forEach(row => {
      const addr = row.address.substring(0, 10) + '...';
      const deployed = row.deployed || 'NULL';
      const deployedDate = row.deployed_date ? row.deployed_date.toISOString().split('T')[0] : 'NULL';
      const tags = row.tags ? row.tags.join(', ') : 'NULL';
      const name = row.contract_name || 'NULL';
      
      console.log(`${addr} | ${deployed} (${deployedDate}) | ${tags} | ${name}`);
      
      // Check issues
      const issues = [];
      
      // Issue 1: Missing deployed time for known contracts
      if (!row.deployed && row.code_hash && row.code_hash !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        issues.push('⚠️  Contract without deployed time');
      }
      
      // Issue 2: Missing tags
      if (!row.tags || row.tags.length === 0) {
        issues.push('⚠️  Missing tags (should be Contract/EOA)');
      }
      
      // Issue 3: Future deployed time
      if (row.deployed && row.deployed > Math.floor(Date.now() / 1000)) {
        issues.push('⚠️  Deployed time is in the future');
      }
      
      if (issues.length > 0) {
        issues.forEach(issue => console.log(`  ${issue}`));
      }
    });
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Check what DataRevalidator would do
    console.log('📝 DataRevalidator will fix these issues:\n');
    
    console.log('1. For USDT (0xdac17f958...)');
    console.log('   - Fetch actual deployment time from blockchain');
    console.log('   - Set deployed = ~1511266584 (2017-11-21)');
    console.log('   - Add tags: [Contract, Verified/Unverified]');
    console.log('   - Fetch contract name if missing');
    
    console.log('\n2. For USDC (0xa0b86991c6...)');
    console.log('   - Fetch actual deployment time from blockchain');
    console.log('   - Set deployed = ~1533324504 (2018-08-03)');
    console.log('   - Add tags: [Contract, Verified/Unverified]');
    console.log('   - Fetch contract name if missing');
    
    console.log('\n3. For DAI (0x6b175474e8...)');
    console.log('   - Fetch actual deployment time from blockchain');
    console.log('   - Set deployed = ~1573672204 (2019-11-13)');
    console.log('   - Add tags: [Contract, Verified/Unverified]');
    console.log('   - Fetch contract name if missing');
    
    console.log('\n✅ To run DataRevalidator and fix these issues:');
    console.log('   NETWORK=ethereum ./run.sh revalidate');
    
    await client.end();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (client) await client.end();
  }
}

testDataRevalidatorDeployed().catch(console.error);
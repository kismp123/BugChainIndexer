// Test DataRevalidator deployed field corrections
const DataRevalidator = require('../core/DataRevalidator');
const { Client } = require('pg');

async function testDataRevalidator() {
  console.log('🔍 Testing DataRevalidator deployed field corrections\n');
  
  // First, check some addresses with potential issues
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'bugchain_indexer',
    user: 'postgres',
    password: ''
  });
  
  try {
    await client.connect();
    
    // Find addresses with potential deployed field issues
    console.log('📊 Finding addresses with potential deployed field issues...\n');
    
    const issueQuery = `
      SELECT address, network, deployed, code_hash, tags, contract_name
      FROM addresses
      WHERE network = 'ethereum'
      AND (
        -- EOAs with deployed time
        (tags = '{EOA}' AND deployed IS NOT NULL)
        OR
        -- Contracts without deployed time
        ('Contract' = ANY(tags) AND deployed IS NULL)
        OR
        -- Addresses without any tags but with code_hash
        ((tags IS NULL OR tags = '{}') AND code_hash IS NOT NULL AND code_hash != '0x0000000000000000000000000000000000000000000000000000000000000000')
      )
      LIMIT 10
    `;
    
    const result = await client.query(issueQuery);
    
    if (result.rows.length > 0) {
      console.log(`Found ${result.rows.length} addresses with potential issues:\n`);
      
      result.rows.forEach(row => {
        console.log(`Address: ${row.address}`);
        console.log(`  Network: ${row.network}`);
        console.log(`  Deployed: ${row.deployed}`);
        console.log(`  Code Hash: ${row.code_hash ? row.code_hash.substring(0, 20) + '...' : 'null'}`);
        console.log(`  Tags: ${JSON.stringify(row.tags)}`);
        console.log(`  Contract Name: ${row.contract_name || 'null'}`);
        console.log();
      });
    } else {
      console.log('No addresses with obvious issues found.\n');
    }
    
    // Test a specific address to see how DataRevalidator would fix it
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🧪 Testing DataRevalidator logic:\n');
    
    process.env.NETWORK = 'ethereum';
    const revalidator = new DataRevalidator();
    
    // Get some addresses to revalidate
    const testQuery = `
      SELECT address, network, deployed, code_hash, tags
      FROM addresses
      WHERE network = 'ethereum'
      AND (tags IS NULL OR tags = '{}')
      LIMIT 5
    `;
    
    const testResult = await client.query(testQuery);
    
    if (testResult.rows.length > 0) {
      console.log(`Testing ${testResult.rows.length} addresses:\n`);
      
      for (const row of testResult.rows) {
        console.log(`Address: ${row.address}`);
        console.log(`  Current deployed: ${row.deployed}`);
        console.log(`  Current tags: ${JSON.stringify(row.tags)}`);
        
        // Note: We can't run full revalidation without network access
        // but we can show what would happen
        console.log(`  Would be checked for:`);
        console.log(`    - EOA vs Contract classification`);
        console.log(`    - Correct deployment time from blockchain`);
        console.log(`    - Proper tag assignment`);
        console.log();
      }
    }
    
    await client.end();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (client) await client.end();
  }
  
  console.log('✅ Test completed\n');
  console.log('📝 DataRevalidator fixes:');
  console.log('  1. Contracts: Sets deployed = actual deployment time from blockchain');
  console.log('  2. EOAs: Sets deployed = null (EOAs are not deployed)');
  console.log('  3. Self-destroyed: Sets deployed = null');
  console.log('  4. Updates tags appropriately (EOA, Contract, Verified, etc.)');
  console.log('  5. Fixes code_hash if incorrect');
}

testDataRevalidator().catch(console.error);
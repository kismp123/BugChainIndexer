// Test DataRevalidator with COALESCE protection
const { Client } = require('pg');

async function testDataRevalidatorProtection() {
  console.log('🧪 Testing DataRevalidator COALESCE Protection\n');

  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'bugchain_indexer',
    user: 'postgres',
    password: ''
  });

  try {
    await client.connect();

    // Step 1: Find a Contract with valid data to test protection
    console.log('📊 Step 1: Finding test contract with complete data...\n');

    const testQuery = `
      SELECT address, network, deployed, code_hash, tags, contract_name, fund
      FROM addresses
      WHERE network = 'ethereum'
      AND 'Contract' = ANY(tags)
      AND deployed IS NOT NULL
      AND code_hash IS NOT NULL
      AND fund > 100000000
      LIMIT 1
    `;

    const testResult = await client.query(testQuery);

    if (testResult.rows.length === 0) {
      console.log('❌ No test data found');
      return;
    }

    const testAddress = testResult.rows[0];
    console.log('✅ Found test address:', testAddress.address);
    console.log('   Current deployed:', testAddress.deployed);
    console.log('   Current code_hash:', testAddress.code_hash?.substring(0, 20) + '...');
    console.log('   Current tags:', testAddress.tags);
    console.log('   Current contract_name:', testAddress.contract_name);
    console.log();

    // Step 2: Test COALESCE protection by trying to update with NULL values
    console.log('🧪 Step 2: Testing COALESCE protection (updating with NULL)...\n');

    const protectionTestQuery = `
      INSERT INTO addresses (
        address, code_hash, contract_name, deployed,
        last_updated, network, first_seen, tags,
        fund, last_fund_updated, name_checked, name_checked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (address, network) DO UPDATE SET
        code_hash = COALESCE(EXCLUDED.code_hash, addresses.code_hash),
        contract_name = COALESCE(EXCLUDED.contract_name, addresses.contract_name),
        deployed = COALESCE(EXCLUDED.deployed, addresses.deployed),
        last_updated = EXCLUDED.last_updated,
        tags = CASE
          WHEN EXCLUDED.tags IS NOT NULL AND array_length(EXCLUDED.tags, 1) > 0
          THEN EXCLUDED.tags
          ELSE addresses.tags
        END
      RETURNING address, deployed, code_hash, contract_name, tags
    `;

    const now = Math.floor(Date.now() / 1000);

    // Try to update with NULL values (should be protected by COALESCE)
    const updateResult = await client.query(protectionTestQuery, [
      testAddress.address,
      null, // code_hash = null (should be protected)
      null, // contract_name = null (should be protected)
      null, // deployed = null (should be protected)
      now, // last_updated
      'ethereum',
      now,
      ['Contract', 'Verified'], // tags (should update)
      testAddress.fund,
      0,
      false,
      0
    ]);

    const afterUpdate = updateResult.rows[0];

    console.log('📋 After update with NULL values:');
    console.log('   deployed:', afterUpdate.deployed, afterUpdate.deployed === testAddress.deployed ? '✅ PROTECTED' : '❌ LOST');
    console.log('   code_hash:', afterUpdate.code_hash?.substring(0, 20) + '...',
                afterUpdate.code_hash === testAddress.code_hash ? '✅ PROTECTED' : '❌ LOST');
    console.log('   contract_name:', afterUpdate.contract_name,
                afterUpdate.contract_name === testAddress.contract_name ? '✅ PROTECTED' : '❌ LOST');
    console.log('   tags:', afterUpdate.tags, '✅ UPDATED');
    console.log();

    // Step 3: Verify protection worked
    const allProtected =
      afterUpdate.deployed === testAddress.deployed &&
      afterUpdate.code_hash === testAddress.code_hash &&
      afterUpdate.contract_name === testAddress.contract_name;

    if (allProtected) {
      console.log('✅ ✅ ✅ COALESCE PROTECTION WORKS CORRECTLY! ✅ ✅ ✅\n');
      console.log('Even when updating with NULL values, existing data was preserved.\n');
      return true;
    } else {
      console.log('❌ ❌ ❌ PROTECTION FAILED! ❌ ❌ ❌\n');
      console.log('Some data was lost when updating with NULL values.\n');
      return false;
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    return false;
  } finally {
    await client.end();
  }
}

// Run test
testDataRevalidatorProtection()
  .then(success => {
    if (success) {
      console.log('🎉 Test completed successfully!');
      process.exit(0);
    } else {
      console.log('💥 Test failed!');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

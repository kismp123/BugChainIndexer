// Test DataRevalidator on a small batch of 10 addresses
const DataRevalidator = require('../core/DataRevalidator');
const { Client } = require('pg');

async function testSmallBatch() {
  console.log('🧪 Testing DataRevalidator on small batch (10 addresses)\n');

  // First, check what addresses will be processed
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'bugchain_indexer',
    user: 'postgres',
    password: ''
  });

  try {
    await client.connect();

    const query = `
      SELECT address, fund, deployed, code_hash, tags
      FROM addresses
      WHERE network = 'ethereum'
      AND (
        (tags IS NULL OR tags = '{}' OR array_length(tags, 1) IS NULL)
        OR (code_hash IS NULL AND tags IS NOT NULL AND 'Contract' = ANY(tags))
        OR (deployed IS NULL AND tags IS NOT NULL AND 'Contract' = ANY(tags))
        OR 'SelfDestroyed' = ANY(tags)
      )
      ORDER BY fund DESC NULLS LAST
      LIMIT 10
    `;

    const result = await client.query(query);

    console.log(`📊 Found ${result.rows.length} addresses to process:\n`);

    result.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.address}`);
      console.log(`   Fund: ${row.fund || 0}`);
      console.log(`   Deployed: ${row.deployed || 'NULL'}`);
      console.log(`   Code Hash: ${row.code_hash ? row.code_hash.substring(0, 20) + '...' : 'NULL'}`);
      console.log(`   Tags: ${JSON.stringify(row.tags)}`);
      console.log();
    });

    await client.end();

  } catch (error) {
    console.error('❌ Error checking addresses:', error.message);
    await client.end();
  }

  // Now run DataRevalidator
  console.log('🚀 Starting DataRevalidator (LIMIT 10 for testing)...\n');

  // Temporarily modify DataRevalidator to process only 10 addresses
  process.env.NETWORK = 'ethereum';
  process.env.TEST_MODE = 'true'; // Flag for limiting

  const revalidator = new DataRevalidator();

  try {
    await revalidator.initialize();

    // Override the query to limit to 10
    const originalMethod = revalidator.reclassifyAllAddresses;
    revalidator.reclassifyAllAddresses = async function() {
      this.log('🔄 Starting address reclassification process (TEST MODE - 10 addresses)...');

      const query = `
        SELECT address, fund
        FROM addresses
        WHERE network = $1
        AND (
          (tags IS NULL OR tags = '{}' OR array_length(tags, 1) IS NULL)
          OR (code_hash IS NULL AND tags IS NOT NULL AND 'Contract' = ANY(tags))
          OR (deployed IS NULL AND tags IS NOT NULL AND 'Contract' = ANY(tags))
          OR 'SelfDestroyed' = ANY(tags)
        )
        ORDER BY fund DESC NULLS LAST
        LIMIT 10
      `;

      const result = await this.queryDB(query, [this.network]);
      const allAddresses = result.rows.map(row => row.address);

      if (allAddresses.length === 0) {
        this.log('⚠️ No addresses found in database');
        return;
      }

      this.log(`✅ Found ${allAddresses.length} addresses to reclassify (TEST MODE)`);

      await this.initializeUnifiedScanner();

      const batchSize = 10;
      let totalProcessed = 0;
      let totalEOAs = 0;
      let totalContracts = 0;
      let totalSelfDestructed = 0;

      for (let i = 0; i < allAddresses.length; i += batchSize) {
        const batch = allAddresses.slice(i, i + batchSize);
        this.log(`\n🔍 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allAddresses.length / batchSize)} (${batch.length} addresses)...`);

        const { eoas, contracts, selfDestructed } = await this.unifiedScanner.performEOAFiltering(batch);

        this.log(`  📊 Classification results: ${eoas.length} EOAs, ${contracts.length} contracts, ${selfDestructed.length} self-destructed`);

        if (contracts.length > 0) {
          this.log(`  ⏱️ Fetching deployment times for ${contracts.length} contracts...`);
          await this.unifiedScanner.fetchDeploymentTimesAsync(contracts);
        }

        if (contracts.length > 0) {
          this.log(`  📝 Fetching contract metadata for ${contracts.length} contracts...`);
          const verifiedContracts = await this.unifiedScanner.verifyContracts(contracts.map(c => c.address));

          const contractNameMap = new Map();
          for (const verified of verifiedContracts) {
            if (verified.contractName) {
              contractNameMap.set(verified.address, verified.contractName);
            }
          }

          for (const contract of contracts) {
            if (contractNameMap.has(contract.address)) {
              contract.contractName = contractNameMap.get(contract.address);
              contract.verified = true;
            }
          }

          this.log(`  ✅ Found metadata for ${contractNameMap.size}/${contracts.length} contracts`);
        }

        const updates = [];

        for (const eoa of eoas) {
          const { normalizeAddress } = require('../common');
          updates.push({
            address: normalizeAddress(eoa.address),
            network: this.network,
            tags: ['EOA'],
            codeHash: null,
            deployed: null,
            contractName: null,
            nameChecked: false,
            nameCheckedAt: 0,
            lastUpdated: this.currentTime
          });
        }

        for (const contract of contracts) {
          const { normalizeAddress } = require('../common');
          const hasName = contract.contractName && contract.verified;
          updates.push({
            address: normalizeAddress(contract.address),
            network: this.network,
            tags: hasName ? ['Contract', 'Verified'] : ['Contract', 'Unverified'],
            codeHash: contract.codeHash,
            deployed: contract.deployTime,
            contractName: contract.contractName || null,
            nameChecked: hasName,
            nameCheckedAt: hasName ? this.currentTime : 0,
            lastUpdated: this.currentTime
          });
        }

        for (const sd of selfDestructed) {
          const { normalizeAddress } = require('../common');
          updates.push({
            address: normalizeAddress(sd.address),
            network: this.network,
            tags: sd.tags,
            codeHash: sd.codeHash,
            deployed: null,
            contractName: sd.contractName || null,
            nameChecked: true,
            nameCheckedAt: this.currentTime,
            lastUpdated: this.currentTime
          });
        }

        if (updates.length > 0) {
          const { batchUpsertAddresses } = require('../common');
          this.log(`  💾 Updating ${updates.length} addresses in database...`);
          await batchUpsertAddresses(this.db, updates, { batchSize: 1000 });
          this.log(`  ✅ Batch update complete`);
        }

        totalProcessed += batch.length;
        totalEOAs += eoas.length;
        totalContracts += contracts.length;
        totalSelfDestructed += selfDestructed.length;

        await this.sleep(1000);
      }

      this.log('\n🎉 Reclassification complete!');
      this.log(`📊 Final statistics:`);
      this.log(`  Total processed: ${totalProcessed}`);
      this.log(`  EOAs: ${totalEOAs}`);
      this.log(`  Contracts: ${totalContracts}`);
      this.log(`  Self-destructed: ${totalSelfDestructed}`);
    };

    await revalidator.reclassifyAllAddresses();

    console.log('\n✅ Test completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testSmallBatch().catch(console.error);

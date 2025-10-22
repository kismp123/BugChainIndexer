/* eslint-disable no-console */
/**
 * Data Revalidator - Revalidate existing data using UnifiedScanner validation logic
 * Applies strict validation to existing database records and flags/fixes invalid data
 */
const Scanner = require('../common/Scanner');
const UnifiedScanner = require('./UnifiedScanner');
const {
  batchUpsertAddresses,
  normalizeAddress,
  BLOCKCHAIN_CONSTANTS
} = require('../common');

class DataRevalidator extends Scanner {
  constructor() {
    super('DataRevalidator', {
      timeout: 7200
    });

    // Initialize UnifiedScanner instance to use its performEOAFiltering method
    this.unifiedScanner = new UnifiedScanner();
  }

  /**
   * Override initialize to skip schema check (schema already exists from other scanners)
   * This prevents the 60-180s delay caused by lock contention during heavy write load
   */
  async initialize() {
    this.log('🔄 Starting initialization...');

    this.log('🔗 Connecting to database...');
    const { initializeDB } = require('../common/core.js');
    this.db = await initializeDB();
    this.log('✅ Database connected');

    // SKIP: await ensureSchema(this.db) - Schema already exists, no need to check
    this.log('⏭️  Skipping schema check (already exists from active scanners)');

    if (!this.config) {
      throw new Error(`Network "${this.network}" not found in config`);
    }

    this.log('🌐 Initializing RPC clients...');
    const { createRpcClient } = require('../common/core.js');
    const clients = createRpcClient(this.network);
    this.alchemyClient = clients.alchemyClient;
    this.logsClient = clients.alchemyClient;
    this.rpc = clients;
    this.log('✅ RPC clients ready (Alchemy RPC for all calls including getLogs)');

    // Auto-detect Alchemy tier if not manually set
    if (this.tierAutoDetect) {
      this.log('🔍 Auto-detecting Alchemy tier...');
      this.alchemyTier = await this.alchemyClient.detectTier();
    }

    // Set max logs block range based on detected/configured tier
    if (this.config.maxLogsBlockRange && this.alchemyTier) {
      this.maxLogsBlockRange = this.config.maxLogsBlockRange[this.alchemyTier];
      this.log(`Max getLogs block range: ${this.maxLogsBlockRange} blocks (${this.alchemyTier} tier)`);
    } else {
      this.maxLogsBlockRange = 10;
      this.log(`Using default max getLogs block range: ${this.maxLogsBlockRange} blocks`, 'warn');
    }

    this.log('✅ Initialization completed successfully');
  }

  /**
   * Initialize UnifiedScanner with same network and database connection
   */
  async initializeUnifiedScanner() {
    if (!this.unifiedScanner.initialized) {
      // Share the same network, database connection, and RPC client
      this.unifiedScanner.network = this.network;
      this.unifiedScanner.db = this.db;
      this.unifiedScanner.rpcClient = this.rpcClient;
      this.unifiedScanner.currentTime = this.currentTime;
      this.unifiedScanner.ZERO_HASH = BLOCKCHAIN_CONSTANTS.ZERO_HASH;

      // Share essential methods from Scanner base class
      this.unifiedScanner.queryDB = this.queryDB.bind(this);
      this.unifiedScanner.log = (msg, level) => this.log(`[UnifiedScanner] ${msg}`, level);
      this.unifiedScanner.isContracts = this.isContracts.bind(this);
      this.unifiedScanner.getCodeHashes = this.getCodeHashes.bind(this);
      this.unifiedScanner.etherscanCall = this.etherscanCall.bind(this);

      this.unifiedScanner.initialized = true;
      this.log('✅ UnifiedScanner initialized for performEOAFiltering');
    }
  }


  /**
   * Reclassify addresses with incomplete data from database using performEOAFiltering
   * Reads addresses with null/empty fields or SelfDestroyed tag, classifies them, and updates DB
   */
  async reclassifyAllAddresses() {
    this.log('🔄 Starting address reclassification process...');

    // Step 1: Read addresses with incomplete data or SelfDestroyed tag from database
    this.log('📖 Reading addresses with incomplete data from database (sorted by fund DESC)...');
    const query = `
      SELECT address, fund
      FROM addresses
      WHERE network = $1
      AND (
        -- Addresses with missing classification (tags)
        (tags IS NULL OR tags = '{}' OR array_length(tags, 1) IS NULL)

        -- OR Contracts with missing code_hash (EOAs naturally have NULL code_hash)
        OR (code_hash IS NULL AND tags IS NOT NULL AND 'Contract' = ANY(tags))

        -- OR Contracts with missing deployed time (EOAs naturally have NULL deployed)
        OR (deployed IS NULL AND tags IS NOT NULL AND 'Contract' = ANY(tags))

        -- OR addresses with SelfDestroyed tag that need revalidation
        OR 'SelfDestroyed' = ANY(tags)
      )
      ORDER BY fund DESC NULLS LAST
      LIMIT 100000
    `;
    const result = await this.queryDB(query, [this.network]);
    const allAddresses = result.rows.map(row => row.address);

    // Log fund range statistics
    if (result.rows.length > 0) {
      const topFund = Number(result.rows[0].fund) || 0;
      const bottomFund = Number(result.rows[result.rows.length - 1].fund) || 0;
      const fundValues = result.rows.map(r => Number(r.fund) || 0).filter(f => f > 0);
      const avgFund = fundValues.length > 0 ? fundValues.reduce((a, b) => a + b, 0) / fundValues.length : 0;

      this.log(`💰 Fund range: Top=${topFund.toFixed(4)} ETH, Avg=${avgFund.toFixed(4)} ETH, Bottom=${bottomFund.toFixed(4)} ETH`);
      this.log(`📊 Addresses with non-zero fund: ${fundValues.length}/${result.rows.length} (${(fundValues.length / result.rows.length * 100).toFixed(2)}%)`);
    }

    if (allAddresses.length === 0) {
      this.log('⚠️ No addresses found in database');
      return;
    }

    this.log(`✅ Found ${allAddresses.length} addresses to reclassify`);

    // Step 2: Initialize UnifiedScanner
    await this.initializeUnifiedScanner();

    // Step 3: Process in batches
    const batchSize = 1000; // Process 1k addresses at a time
    let totalProcessed = 0;
    let totalEOAs = 0;
    let totalContracts = 0;
    let totalSelfDestructed = 0;

    for (let i = 0; i < allAddresses.length; i += batchSize) {
      const batch = allAddresses.slice(i, i + batchSize);
      this.log(`\n🔍 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allAddresses.length / batchSize)} (${batch.length} addresses)...`);

      // Step 4: Classify using performEOAFiltering
      const { eoas, contracts, selfDestructed } = await this.unifiedScanner.performEOAFiltering(batch);

      this.log(`  📊 Classification results: ${eoas.length} EOAs, ${contracts.length} contracts, ${selfDestructed.length} self-destructed`);

      // Step 5: Fetch deployment times for contracts
      if (contracts.length > 0) {
        this.log(`  ⏱️ Fetching deployment times for ${contracts.length} contracts...`);
        await this.unifiedScanner.fetchDeploymentTimesAsync(contracts);
      }

      // Step 5.5: Fetch contract metadata (names) from Etherscan
      if (contracts.length > 0) {
        this.log(`  📝 Fetching contract metadata for ${contracts.length} contracts...`);
        const verifiedContracts = await this.unifiedScanner.verifyContracts(contracts.map(c => c.address));

        // Create a map of verified contract names
        const contractNameMap = new Map();
        for (const verified of verifiedContracts) {
          if (verified.contractName) {
            contractNameMap.set(verified.address, verified.contractName);
          }
        }

        // Update contract objects with names
        for (const contract of contracts) {
          if (contractNameMap.has(contract.address)) {
            contract.contractName = contractNameMap.get(contract.address);
            contract.verified = true;
          }
        }

        this.log(`  ✅ Found metadata for ${contractNameMap.size}/${contracts.length} contracts`);
      }

      // Step 6: Prepare updates for DB
      const updates = [];

      // Add EOAs
      for (const eoa of eoas) {
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

      // Add Contracts
      for (const contract of contracts) {
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

      // Add SelfDestructed
      for (const sd of selfDestructed) {
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

      // Step 7: Update database
      if (updates.length > 0) {
        this.log(`  💾 Updating ${updates.length} addresses in database...`);
        await batchUpsertAddresses(this.db, updates, { batchSize: 1000 });
        this.log(`  ✅ Batch update complete`);
      }

      totalProcessed += batch.length;
      totalEOAs += eoas.length;
      totalContracts += contracts.length;
      totalSelfDestructed += selfDestructed.length;

      // Small delay between batches
      await this.sleep(1000);
    }

    this.log('\n🎉 Reclassification complete!');
    this.log(`📊 Final statistics:`);
    this.log(`  Total processed: ${totalProcessed}`);
    this.log(`  EOAs: ${totalEOAs}`);
    this.log(`  Contracts: ${totalContracts}`);
    this.log(`  Self-destructed: ${totalSelfDestructed}`);
  }


  /**
   * Main validation process
   */
  async run() {
    this.log('🚀 Starting Data Revalidation Process');
    await this.reclassifyAllAddresses();
    this.log('🎉 Data Revalidation Complete!');
  }
}

// Execute if run directly
if (require.main === module) {
  const revalidator = new DataRevalidator();
  revalidator.execute().catch(error => {
    console.error('Data revalidation failed:', error);
    process.exit(1);
  });
}

module.exports = DataRevalidator;
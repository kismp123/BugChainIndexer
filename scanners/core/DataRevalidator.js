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
  isValidAddress,
  BLOCKCHAIN_CONSTANTS
} = require('../common');

class DataRevalidator extends Scanner {
  constructor() {
    super('DataRevalidator', {
      timeout: 7200,
      batchSizes: {
        addresses: 20000,  // Increased to 20,000 for large-scale batch processing
        verification: 1000  // Increased verification batch size as well
      }
    });
    
    // Initialize UnifiedScanner instance to use its performEOAFiltering method
    this.unifiedScanner = new UnifiedScanner();
    
    // Check for recent contracts mode
    this.recentMode = process.env.RECENT_CONTRACTS === 'true';
    this.recentDays = parseInt(process.env.RECENT_DAYS || '30', 10);
    
    this.stats = {
      totalProcessed: 0,
      validRecords: 0,
      invalidDeploymentTimes: 0,
      misclassifiedAddresses: 0,
      unreasonableValues: 0,
      correctedRecords: 0,
      skippedRecords: 0,
      errors: 0,
      invalidTags: 0
    };

    this.validationResults = {
      toFix: [],
      toFlag: [],
      toSkip: []
    };
  }

  /**
   * Get addresses to revalidate from database
   * Focus on non-EOA addresses that don't have Contract tag yet
   */
  async getAddressesToRevalidate(limit = 100000) {
    let query;
    let params;
    
    if (this.recentMode) {
      // Recent contracts mode - find contracts discovered in the last N days
      const cutoffTime = this.currentTime - (this.recentDays * 24 * 60 * 60);
      
      query = `
        SELECT 
          address, 
          network, 
          deployed, 
          code_hash,
          contract_name,
          tags,
          fund,
          last_updated,
          name_checked,
          name_checked_at,
          first_seen
        FROM addresses
        WHERE network = $1
        AND first_seen >= $2                                              -- Discovered within N days
        AND (tags IS NULL OR tags = '{}' OR NOT 'EOA' = ANY(tags))      -- Non-EOA addresses
        ORDER BY first_seen DESC, fund DESC NULLS LAST
        LIMIT $3
      `;
      
      params = [
        this.network,     // $1: network
        cutoffTime,       // $2: cutoff time for recent discovery
        limit            // $3: limit
      ];
      
      this.log(`🔍 Recent mode: Finding contracts discovered in last ${this.recentDays} days (since ${new Date(cutoffTime * 1000).toISOString()})`);
    } else {
      // Standard mode - focus on addresses without proper tags
      query = `
        SELECT 
          address, 
          network, 
          deployed, 
          code_hash,
          contract_name,
          tags,
          fund,
          last_updated,
          name_checked,
          name_checked_at
        FROM addresses
        WHERE network = $1
        AND (tags IS NULL OR tags = '{}' OR NOT 'EOA' = ANY(tags))           -- Non-EOA addresses
        AND (tags IS NULL OR tags = '{}' OR NOT 'Contract' = ANY(tags))      -- Without Contract tag
        ORDER BY fund DESC NULLS LAST, last_updated ASC NULLS FIRST
        LIMIT $2
      `;
      
      params = [
        this.network,     // $1: network
        limit            // $2: limit
      ];
    }
    
    const result = await this.queryWithCache('getAddressesToRevalidate', query, params);
    return result.rows;
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
   * Validate multiple address records efficiently using batch performEOAFiltering
   */
  async validateAddressBatch(records) {
    if (records.length === 0) return [];
    
    // Extract addresses for batch processing
    const addresses = records.map(record => record.address);
    const recordMap = new Map(records.map(record => [record.address, record]));
    
    this.log(`🔍 Validating batch of ${addresses.length} addresses...`);

    try {
      // Validate address formats first
      const validAddresses = [];
      const invalidResults = [];
      
      for (const address of addresses) {
        if (!isValidAddress(address)) {
          invalidResults.push({
            address,
            issues: ['invalid_address_format'],
            corrections: {},
            skip: true
          });
          this.stats.errors++;
        } else {
          validAddresses.push(address);
        }
      }

      // Batch process valid addresses using UnifiedScanner's performEOAFiltering
      let batchResults = [];
      if (validAddresses.length > 0) {
        // Initialize UnifiedScanner
        await this.initializeUnifiedScanner();
        
        // Use UnifiedScanner's performEOAFiltering method directly
        const filteringResult = await this.unifiedScanner.performEOAFiltering(validAddresses);
        const { eoas, contracts, selfDestructed } = filteringResult;
        
        // Create lookup maps for efficient processing
        const contractMap = new Map(contracts.map(c => [c.address, c]));
        const selfDestroyedMap = new Map(selfDestructed.map(s => [s.address, s]));
        const eoaSet = new Set(eoas.map(e => e.address));
        
        // Process each valid address
        for (const address of validAddresses) {
          const record = recordMap.get(address);
          const { deployed, code_hash } = record;
          const issues = [];
          const corrections = {};
          
          if (contractMap.has(address)) {
            // Contract detected
            const contract = contractMap.get(address);
            this.log(`📋 Address ${address} is a CONTRACT`);
            
            // Apply EXACT UnifiedScanner contract data structure
            corrections.codeHash = contract.codeHash;
            corrections.deployed = contract.deployTime;
            
            // Check if we need to fetch contract metadata (name_checked = false or contract_name is null)
            const needsMetadata = !record.name_checked || !record.contract_name;
            
            if (needsMetadata) {
              this.log(`🔍 Fetching metadata for contract ${address}`);
              // We'll fetch this in a separate step after EOA filtering
              corrections.needsMetadata = true;
            }
            
            const isVerified = Boolean(record.name_checked && record.contract_name);
            corrections.tags = isVerified ? ['Contract', 'Verified'] : ['Contract', 'Unverified'];
            // If metadata is needed, set contractName to null to allow fresh update
            corrections.contractName = needsMetadata ? null : (record.contract_name || null);
            corrections.fund = 0;
            corrections.lastFundUpdated = 0;
            corrections.nameChecked = needsMetadata ? false : isVerified;
            corrections.nameCheckedAt = needsMetadata ? 0 : (isVerified ? this.currentTime : 0);
            
            // Check for incorrect data
            if (code_hash !== contract.codeHash) {
              issues.push('incorrect_code_hash');
            }
            if (!deployed || deployed !== contract.deployTime) {
              issues.push('incorrect_deployment_time');
            }
            
          } else if (selfDestroyedMap.has(address)) {
            // Self-destroyed contract detected
            const selfDestroyed = selfDestroyedMap.get(address);
            this.log(`📋 Address ${address} is a SELF-DESTROYED CONTRACT`);
            
            corrections.codeHash = selfDestroyed.codeHash;
            corrections.deployed = null;
            corrections.tags = selfDestroyed.tags;
            corrections.contractName = selfDestroyed.contractName;
            corrections.fund = 0;
            corrections.lastFundUpdated = 0;
            corrections.nameChecked = true;
            corrections.nameCheckedAt = this.currentTime;
            
            issues.push('self_destroyed_contract');
            
          } else if (eoaSet.has(address)) {
            // EOA detected
            this.log(`📋 Address ${address} is an EOA`);
            
            corrections.codeHash = null;
            corrections.deployed = null;
            corrections.tags = ['EOA'];
            corrections.contractName = null;
            corrections.fund = 0;
            corrections.lastFundUpdated = 0;
            corrections.nameChecked = false;
            corrections.nameCheckedAt = 0;
            
            // Validate existing data against UnifiedScanner standards
            if (deployed && deployed !== null) {
              issues.push('eoa_with_deployment_time');
            }
            if (code_hash && code_hash !== null) {
              issues.push('eoa_with_code_hash');
            }
            if (record.contract_name && record.contract_name !== null) {
              issues.push('eoa_with_contract_name');
            }
            if (record.name_checked === true) {
              issues.push('eoa_marked_as_name_checked');
            }
            if (record.name_checked_at && record.name_checked_at !== 0) {
              issues.push('eoa_with_name_checked_timestamp');
            }
          } else {
            // No classification possible - skip
            this.log(`⚠️ Cannot classify ${address} - skipping`, 'warn');
            batchResults.push({
              address,
              issues: ['unclassifiable_address'],
              corrections: {},
              skip: true
            });
            continue;
          }

          this.stats.totalProcessed++;
          
          if (issues.length === 0) {
            this.stats.validRecords++;
            batchResults.push({ address, issues: [], corrections: {}, valid: true });
          } else {
            batchResults.push({ address, issues, corrections, valid: false });
          }
        }
      }

      return [...invalidResults, ...batchResults];

    } catch (error) {
      this.log(`❌ Batch validation error: ${error.message}`, 'error');
      // Return error results for all addresses
      return addresses.map(address => ({
        address,
        issues: ['batch_validation_error'],
        corrections: {},
        skip: true
      }));
    }
  }

  /**
   * Process validation results and apply corrections
   */
  async processValidationResults(results) {
    const updates = [];
    const contractsNeedingMetadata = [];
    
    for (const result of results) {
      if (result.skip) {
        this.validationResults.toSkip.push(result);
        this.stats.skippedRecords++;
        continue;
      }

      if (result.valid) {
        this.stats.validRecords++;
        continue;
      }

      // Has issues and corrections
      if (Object.keys(result.corrections).length > 0) {
        // Check if contract needs metadata fetching
        if (result.corrections.needsMetadata) {
          contractsNeedingMetadata.push(result.address);
        }
        
        // Use EXACT same field structure as UnifiedScanner
        const updateData = {
          address: normalizeAddress(result.address),
          network: this.network,
          lastUpdated: this.currentTime,
          firstSeen: this.currentTime, // UnifiedScanner always sets firstSeen
          nameChecked: result.corrections.nameChecked !== undefined ? result.corrections.nameChecked : false,
          nameCheckedAt: result.corrections.nameCheckedAt !== undefined ? result.corrections.nameCheckedAt : 0,
          fund: result.corrections.fund !== undefined ? result.corrections.fund : 0,
          lastFundUpdated: result.corrections.lastFundUpdated !== undefined ? result.corrections.lastFundUpdated : 0,
          contractName: result.corrections.contractName !== undefined ? result.corrections.contractName : null,
          // Apply corrections with exact field names that batchUpsertAddresses expects
          codeHash: result.corrections.codeHash !== undefined ? result.corrections.codeHash : undefined,
          deployed: result.corrections.deployed !== undefined ? result.corrections.deployed : undefined,
          tags: result.corrections.tags !== undefined ? result.corrections.tags : undefined
        };

        // Remove undefined fields to let database handle defaults
        Object.keys(updateData).forEach(key => {
          if (updateData[key] === undefined) {
            delete updateData[key];
          }
        });

        updates.push(updateData);
        this.validationResults.toFix.push({
          address: result.address,
          issues: result.issues,
          corrections: result.corrections
        });
        
        this.stats.correctedRecords++;
        
        this.log(`🔧 Corrections for ${result.address}: ${result.issues.join(', ')}`);
      } else {
        this.validationResults.toFlag.push(result);
        this.log(`🚩 Issues found for ${result.address}: ${result.issues.join(', ')}`);
      }
    }

    // Apply updates to database
    if (updates.length > 0) {
      try {
        await batchUpsertAddresses(this.db, updates, { batchSize: 100 });
        this.log(`✅ Applied ${updates.length} corrections to database`);
      } catch (error) {
        this.log(`❌ Failed to apply corrections: ${error.message}`, 'error');
        throw error;
      }
    }

    // Fetch metadata for contracts that need it
    if (contractsNeedingMetadata.length > 0) {
      this.log(`🔍 Fetching metadata for ${contractsNeedingMetadata.length} contracts...`);
      await this.fetchContractMetadata(contractsNeedingMetadata);
    }

    return updates.length;
  }

  /**
   * Fetch contract metadata (name, ABI, etc.) using UnifiedScanner logic
   */
  async fetchContractMetadata(contractAddresses) {
    if (contractAddresses.length === 0) return;

    this.log(`🔍 Starting metadata fetch for ${contractAddresses.length} contracts`);
    
    try {
      // Use UnifiedScanner's contract verification logic
      const verifiedContracts = await this.unifiedScanner.verifyContracts(contractAddresses);
      
      if (verifiedContracts.length > 0) {
        this.log(`📝 Fetched metadata for ${verifiedContracts.length} contracts, updating database...`);
        
        // Apply metadata updates to database
        await batchUpsertAddresses(this.db, verifiedContracts, { batchSize: 100 });
        this.log(`✅ Applied metadata updates for ${verifiedContracts.length} contracts`);
      } else {
        this.log(`⚠️ No metadata found for any of the ${contractAddresses.length} contracts`);
      }
      
    } catch (error) {
      this.log(`❌ Failed to fetch contract metadata: ${error.message}`, 'warn');
      // Continue execution - metadata fetching is not critical for basic validation
    }
  }

  /**
   * Generate validation report
   */
  generateReport() {
    const report = {
      summary: {
        totalProcessed: this.stats.totalProcessed,
        validRecords: this.stats.validRecords,
        correctedRecords: this.stats.correctedRecords,
        skippedRecords: this.stats.skippedRecords,
        errors: this.stats.errors
      },
      issues: {
        invalidDeploymentTimes: this.stats.invalidDeploymentTimes,
        misclassifiedAddresses: this.stats.misclassifiedAddresses,
        unreasonableValues: this.stats.unreasonableValues,
        invalidTags: this.stats.invalidTags
      },
      results: {
        fixed: this.validationResults.toFix.length,
        flagged: this.validationResults.toFlag.length,
        skipped: this.validationResults.toSkip.length
      }
    };

    this.log('\n📊 Data Revalidation Report:');
    this.log(`  Total Processed: ${report.summary.totalProcessed}`);
    this.log(`  Valid Records: ${report.summary.validRecords}`);
    this.log(`  Corrected Records: ${report.summary.correctedRecords}`);
    this.log(`  Skipped Records: ${report.summary.skippedRecords}`);
    this.log(`  Errors: ${report.summary.errors}`);
    this.log('');
    this.log('🔍 Issue Breakdown:');
    this.log(`  Missing Contract/EOA Tags: ${report.issues.invalidTags}`);
    this.log(`  Invalid Deployment Times: ${report.issues.invalidDeploymentTimes}`);
    this.log(`  Misclassified Addresses: ${report.issues.misclassifiedAddresses}`);
    this.log(`  Unreasonable Values: ${report.issues.unreasonableValues}`);
    this.log('');
    this.log('✨ UnifiedScanner Compatibility:');
    this.log(`  Applied same tagging system: Contract + Verified/Unverified or EOA`);
    this.log(`  Used identical validation logic: on-chain state verification`);
    this.log(`  Matched data structure: same field formats and values`);

    if (this.validationResults.toFlag.length > 0) {
      this.log('\n🚩 Records requiring manual review:');
      this.validationResults.toFlag.slice(0, 10).forEach(item => {
        this.log(`  ${item.address}: ${item.issues.join(', ')}`);
      });
      if (this.validationResults.toFlag.length > 10) {
        this.log(`  ... and ${this.validationResults.toFlag.length - 10} more`);
      }
    }

    return report;
  }

  /**
   * Main validation process
   */
  async run() {
    this.log('🚀 Starting Data Revalidation Process');
    
    if (this.recentMode) {
      this.log(`📅 RECENT MODE: Validating contracts discovered in last ${this.recentDays} days`);
    } else {
      this.log('📋 STANDARD MODE: Using UnifiedScanner validation logic for strict data verification');
    }

    // Initialize UnifiedScanner for performEOAFiltering
    await this.initializeUnifiedScanner();

    const addresses = await this.getAddressesToRevalidate();
    if (addresses.length === 0) {
      if (this.recentMode) {
        this.log(`✅ No contracts discovered in the last ${this.recentDays} days need revalidation`);
      } else {
        this.log('✅ No addresses need revalidation');
      }
      return;
    }

    this.log(`📊 Found ${addresses.length} addresses requiring revalidation`);

    const processor = async (addressBatch) => {
      try {
        // Use efficient batch validation
        const results = await this.validateAddressBatch(addressBatch);
        
        // Process validation results
        const updatesApplied = await this.processValidationResults(results);
        
        return {
          processed: results.length,
          updated: updatesApplied
        };
      } catch (error) {
        this.log(`❌ Batch processor error: ${error.message}`, 'error');
        return {
          processed: 0,
          updated: 0,
          error: true
        };
      }
    };

    // Process addresses in batches with optimized settings for large-scale processing
    await this.processBatch(addresses, processor, {
      batchSize: this.batchSizes.addresses, // 20,000 addresses per batch
      concurrency: 1, // Sequential processing for data integrity and API rate limiting
      delayMs: 1000   // Slightly increased delay due to larger batch size
    });

    // Generate and display final report
    const report = this.generateReport();

    // Save detailed results to file for review
    if (this.validationResults.toFlag.length > 0) {
      const flaggedFile = `logs/flagged-records-${this.network}-${Date.now()}.json`;
      require('fs').writeFileSync(flaggedFile, JSON.stringify(this.validationResults.toFlag, null, 2));
      this.log(`\n📄 Flagged records saved to: ${flaggedFile}`);
    }

    this.log('\n🎉 Data Revalidation Complete!');
    return report;
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
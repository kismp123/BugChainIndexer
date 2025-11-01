/* eslint-disable no-console */
/**
 * Unified Scanner - Complete Blockchain Analysis Pipeline
 * Combines active address scanning, EOA filtering, and contract verification in a single efficient pipeline
 * Multi-stage pipeline: Transfer Events → Filter Existing → EOA Detection → Contract Verification → Database Storage
 */
const Scanner = require('../common/Scanner');
const { 
  batchUpsertAddresses, 
  normalizeAddress, 
  normalizeAddressArray,
  BATCH_SIZES, 
  TIMEOUTS, 
  PERFORMANCE, 
  PROCESSING, 
  BLOCKCHAIN_CONSTANTS,
  withTimeoutAndRetry
} = require('../common');
const { CONFIG } = require('../config/networks.js');

class UnifiedScanner extends Scanner {
  constructor() {
    super('UnifiedScanner', {
      timeout: 5400, // Extended timeout for combined operations
      batchSizes: {
        logs: BATCH_SIZES.LOGS_DEFAULT,
        addresses: BATCH_SIZES.ADDRESSES_DEFAULT,
        contracts: BATCH_SIZES.CONTRACTS_DEFAULT,
        verification: BATCH_SIZES.VERIFICATION_BATCH,
        etherscan: BATCH_SIZES.ETHERSCAN_BATCH
      }
    });
    
    this.timeDelay = CONFIG.TIMEDELAY || 1;
    this.transferEvent = BLOCKCHAIN_CONSTANTS.TRANSFER_EVENT;
    this.blockRetryCount = new Map(); // Track retry attempts for each block range
    this.permanentlyExcludedBlocks = new Set(); // Track blocks that permanently failed getLogs

    // Log density learning system
    this.logDensityStats = {
      samples: [],           // Array of {blocks, logs, logsPerBlock}
      totalLogs: 0,
      totalBlocks: 0,
      avgLogsPerBlock: 0,
      minLogsPerBlock: Infinity,
      maxLogsPerBlock: 0,
      sampleCount: 0,
      lastSaved: 0           // Timestamp of last DB save
    };
    this.SAVE_STATS_INTERVAL = 100; // Save stats every 100 samples
    this.MAX_SAMPLES = 1000;        // Keep last 1000 samples in memory

    // Pipeline statistics
    this.stats = {
      transferAddresses: 0,
      newAddresses: 0,
      eoaFiltered: 0,
      contractsFound: 0,
      contractsVerified: 0,
      contractsUnverified: 0,
      errors: 0
    };

  }

  /**
   * Load permanently excluded blocks from database
   */
  async loadPermanentlyExcludedBlocks() {
    try {
      const query = `
        SELECT block_number
        FROM excluded_blocks
        WHERE network = $1
      `;
      const result = await this.queryDB(query, [this.network]);

      result.rows.forEach(row => {
        this.permanentlyExcludedBlocks.add(row.block_number);
      });

      if (this.permanentlyExcludedBlocks.size > 0) {
        this.log(`📋 Loaded ${this.permanentlyExcludedBlocks.size} permanently excluded blocks from database`);
      }
    } catch (error) {
      // Table might not exist - create it
      if (error.message.includes('does not exist')) {
        this.log('📋 Creating excluded_blocks table...');
        await this.createExcludedBlocksTable();
      } else {
        this.log(`⚠️ Failed to load excluded blocks: ${error.message}`, 'warn');
      }
    }
  }

  /**
   * Create the excluded_blocks table if it doesn't exist
   */
  async createExcludedBlocksTable() {
    try {
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS excluded_blocks (
          network VARCHAR(50) NOT NULL,
          block_number INTEGER NOT NULL,
          reason TEXT,
          excluded_at INTEGER NOT NULL,
          PRIMARY KEY (network, block_number)
        );
        CREATE INDEX IF NOT EXISTS idx_excluded_blocks_network ON excluded_blocks(network);
      `;
      await this.queryDB(createTableQuery, []);
      this.log('✅ Created excluded_blocks table');
    } catch (error) {
      this.log(`⚠️ Failed to create excluded_blocks table: ${error.message}`, 'warn');
    }
  }

  /**
   * Permanently exclude a block from processing
   * @param {number} blockNumber - Block number to exclude
   * @param {string} reason - Reason for exclusion
   */
  async permanentlyExcludeBlock(blockNumber, reason = 'getLogs failed after retries') {
    // Add to in-memory set
    this.permanentlyExcludedBlocks.add(blockNumber);

    // Save to database for persistence
    try {
      const query = `
        INSERT INTO excluded_blocks (network, block_number, reason, excluded_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (network, block_number) DO NOTHING
      `;
      await this.queryDB(query, [this.network, blockNumber, reason, this.currentTime]);
      this.log(`🚫 Permanently excluded block ${blockNumber}: ${reason}`, 'warn');
    } catch (error) {
      this.log(`⚠️ Failed to save excluded block ${blockNumber} to database: ${error.message}`, 'warn');
      // Keep in memory even if database save fails
    }
  }



  async getTargetBlocks() {
    const targetHours = this.timeDelay;
    
    // Calculate target timestamp
    const targetTimestamp = this.currentTime - (targetHours * 60 * 60);
    
    this.log(`🔍 Finding blocks for last ${targetHours} hours...`);
    
    // getBlockByTime now handles validation internally
    const fromBlock = await this.getBlockByTime(targetTimestamp);
    const currentBlock = await this.getBlockNumber();
    
    
    this.log(`📈 Scan range: blocks ${fromBlock} → ${currentBlock} (${currentBlock - fromBlock} blocks)`);
    return { fromBlock, toBlock: currentBlock };
  }

  async filterExistingAddresses(addresses) {
    if (addresses.length === 0) return [];
    
    // Normalize all addresses for consistent comparison
    const normalizedAddresses = normalizeAddressArray(addresses);
    this.log(`🔍 Filtering ${normalizedAddresses.length} addresses...`);
    
    const batchSize = 1000;
    const existingAddresses = new Set();
    
    // Optimized query using ANY operator for better performance
    for (let i = 0; i < normalizedAddresses.length; i += batchSize) {
      const batch = normalizedAddresses.slice(i, i + batchSize);
      // Use ANY operator instead of dynamic placeholders - better for prepared statements
      const query = `SELECT address FROM addresses WHERE address = ANY($1) AND network = $2`;
      
      try {
        const result = await this.queryWithCache('checkExistingAddresses', query, [batch, this.network]);
        result.rows.forEach(row => existingAddresses.add(row.address));
      } catch (error) {
        this.log(`❌ DB error: ${error.message.slice(0, 30)}...`);
      }
    }
    
    const newAddresses = normalizedAddresses.filter(addr => !existingAddresses.has(addr));
    this.stats.newAddresses = newAddresses.length;
    
    this.log(`✅ Found ${newAddresses.length} new addresses (${existingAddresses.size} existing)`);
    
    return newAddresses;
  }

  async performEOAFiltering(addresses) {
    this.log(`Processing ${addresses.length} addresses for advanced EOA filtering...`);
    
    // Check which are contracts vs EOA
    const contractFlags = await this.isContracts(addresses);
    const codeHashes = await this.getCodeHashes(addresses);
    
    // Batch fetch deployment times from database for all potential contracts
    const deploymentCache = new Map();
    
    try {
      // Get all existing contract data in a single query
      const deploymentQuery = `
        SELECT address, deployed, code_hash, contract_name, name_checked
        FROM addresses
        WHERE address = ANY($1)
        AND network = $2
      `;
      const deploymentResult = await this.queryDB(deploymentQuery, [addresses, this.network]);
      
      // Build cache map
      for (const row of deploymentResult.rows) {
        deploymentCache.set(row.address.toLowerCase(), {
          deployed: row.deployed,
          codeHash: row.code_hash,
          contractName: row.contract_name,
          nameChecked: row.name_checked
        });
      }
      
      this.log(`📊 Loaded ${deploymentCache.size} deployment times from cache`);
    } catch (error) {
      this.log(`⚠️ Failed to batch fetch deployment times: ${error.message}`, 'warn');
      // Continue without cache
    }
    
    const eoas = [];
    const contracts = [];
    const selfDestructed = [];
    
    // Process each address with enhanced classification
    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      const isContract = contractFlags[i];
      const codeHash = codeHashes[i] || null;
      
      if (isContract && codeHash && codeHash !== this.ZERO_HASH) {
        // Active contract - check cache first
        let deployTime = null;
        let isGenesisContract = false;
        let needsDeploymentTime = false;
        
        // Check if we have cached deployment time
        const cached = deploymentCache.get(address.toLowerCase());
        if (cached && cached.deployed && cached.deployed > 0) {
          deployTime = cached.deployed;
          this.log(`📋 Using cached deployment time for ${address}`);
        } else {
          // Mark for async deployment time fetching later
          needsDeploymentTime = true;
          deployTime = null; // Will be fetched asynchronously later
          
          // Check if it might be a genesis contract (simple check without API call)
          const { getGenesisTimestamp } = require('../config/genesis-timestamps');
          const genesisTime = getGenesisTimestamp(this.config?.chainId);
          if (genesisTime) {
            // For now, we'll use genesis time as a placeholder for contracts that might be genesis
            // The actual verification will happen in background
            isGenesisContract = false; // Will be determined later
          }
        }
        
        // Now use actual deployment time for address type classification
        const { safeGetAddressType } = require('../common');
        const addressType = safeGetAddressType(address, codeHash, deployTime);
        
        if (!addressType || addressType === 'unknown') {
          this.log(`⚠️ Unknown address type for ${address} - skipping`, 'warn');
          continue; // Skip if we can't determine address type
        }
        
        if (addressType === 'eoa') {
          // True EOA
          eoas.push({ address, codeHash: null, isContract: false });
        } else if (addressType === 'eip7702_eoa') {
          // EIP-7702 EOA - treat as enhanced EOA
          // Strict validation: EIP-7702 should have specific code hash
          if (!codeHash || codeHash === this.ZERO_HASH) {
            this.log(`⚠️ Skipping EIP-7702 EOA ${address} - invalid code hash (${codeHash})`, 'warn');
            continue;
          }
          
          this.log(`🎯 EIP-7702 EOA detected: ${address}`, 'info');
          eoas.push({ 
            address, 
            codeHash: codeHash, // Store the actual code hash for EIP-7702 pattern
            isContract: false, // Still classified as EOA
            type: 'eip7702_eoa',
            tags: ['EOA', 'SmartWallet']
          });
        } else if (addressType === 'smart_contract' || addressType === 'contract') {
          // Smart Contract - deployment time will be fetched asynchronously if needed
          if (deployTime) {
            this.log(`📍 Contract ${address} deployment time: ${new Date(deployTime * 1000).toISOString()}`);
          } else if (needsDeploymentTime) {
            this.log(`📍 Contract ${address} - deployment time will be fetched asynchronously`);
          }

          contracts.push({
            address,
            codeHash,
            deployTime,
            type: 'smart_contract',
            isGenesis: isGenesisContract,
            needsDeploymentTime: needsDeploymentTime || false,
            // Include cached verification data to skip already verified contracts
            nameChecked: cached?.nameChecked || false,
            contractName: cached?.contractName || null
          });
        } else {
          // Unknown type - skip completely to avoid uncertain data
          this.log(`⚠️ Unknown address type for ${address} - skipping (uncertain data)`, 'warn');
          continue;
        }
      } else if (!isContract) {
        // No code on chain currently - check if it was a contract before (self-destructed)
        const cached = deploymentCache.get(address.toLowerCase());

        if (cached && cached.codeHash && cached.codeHash !== this.ZERO_HASH) {
          // DB has code_hash but chain has no code → Self-Destroyed Contract
          this.log(`💥 Self-destructed contract detected: ${address}`);
          selfDestructed.push({
            address,
            codeHash: cached.codeHash,  // Use DB's code hash
            type: 'self_destroyed',
            contractName: 'Self-Destroyed Contract',
            tags: ['Contract', 'SelfDestroyed']
          });
        } else {
          // No code_hash in DB either → True EOA
          eoas.push({ address, codeHash: null, isContract: false });
        }
      } else {
        // Edge case: shouldn't reach here
        this.log(`⚠️ Unexpected state for ${address}: isContract=${isContract}, codeHash=${codeHash}`, 'warn');
        eoas.push({ address, codeHash: null, isContract: false });
      }
    }
    
    this.log(`Simplified filtering: ${eoas.length} EOAs (including EIP-7702), ${contracts.length} smart contracts, ${selfDestructed.length} self-destroyed`);
    
    return { eoas, contracts, selfDestructed };
  }




  /**
   * Asynchronously fetch deployment times for contracts that need them
   * This runs in background to avoid blocking the main processing pipeline
   * @param {Array} contracts - Array of contract objects with needsDeploymentTime flag
   */
  async fetchDeploymentTimesAsync(contracts = []) {
    const contractsNeedingTime = contracts.filter(c => c.needsDeploymentTime);
    
    if (contractsNeedingTime.length === 0) return;
    
    this.log(`⏳ Starting async deployment time fetch for ${contractsNeedingTime.length} contracts...`);
    
    // Use batch API (max 5 addresses per call)
    const batchSize = 5;
    const { getContractDeploymentTimeBatch } = require('../common');
    
    for (let i = 0; i < contractsNeedingTime.length; i += batchSize) {
      const batch = contractsNeedingTime.slice(i, i + batchSize);
      const batchAddresses = batch.map(c => c.address);
      
      try {
        // Batch API call for up to 5 contracts at once
        const deploymentResults = await getContractDeploymentTimeBatch(this, batchAddresses);
        
        // Update contract objects in memory (DB will be updated by caller)
        for (const contract of batch) {
          const result = deploymentResults.get(contract.address.toLowerCase());
          
          if (result && result.timestamp && result.timestamp > 0) {
            // Update the contract object in memory
            contract.deployTime = result.timestamp;
            contract.isGenesis = result.isGenesis;
            
            this.log(`✅ Fetched deployment time for ${contract.address}: ${new Date(result.timestamp * 1000).toISOString()}`);
          } else {
            this.log(`⚠️ No deployment time found for ${contract.address}`, 'warn');
          }
        }
        
      } catch (error) {
        this.log(`⚠️ Batch deployment fetch failed for ${batchAddresses.join(', ')}: ${error.message}`, 'warn');
      }
      
      // Small delay between batches to respect API rate limits (skip if using proxy)
      const useEtherscanProxy = process.env.USE_ETHERSCAN_PROXY === 'true';
      if (!useEtherscanProxy && i + batchSize < contractsNeedingTime.length) {
        await this.sleep(1000); // 1 second delay between batches
      }
    }
    
    this.log(`✅ Completed async deployment time fetch for ${contractsNeedingTime.length} contracts`);
  }

  async verifyContracts(contracts = []) {
    if (contracts.length === 0) return [];

    // Filter out contracts that are already verified (cached)
    const needsVerification = contracts.filter(c => !c.nameChecked);
    const alreadyVerified = contracts.filter(c => c.nameChecked);

    this.log(`🔍 Contracts: ${contracts.length} total, ${alreadyVerified.length} cached, ${needsVerification.length} need verification`);

    // Prepare cached contracts (skip API calls)
    const verifiedContracts = alreadyVerified.map(c => ({
      address: c.address,
      network: this.network,
      verified: true,
      contractName: c.contractName || 'Unknown',
      codeHash: c.codeHash,
      deployTime: c.deployTime || null,  // Include existing deployTime from cache
      needsDeploymentTime: !c.deployTime || c.deployTime <= 0,  // Flag if deployment time is missing
      sourceCode: null, // Not stored in cache
      abi: null, // Not stored in cache
      compilerVersion: null,
      optimization: false,
      runs: 0,
      constructorArguments: null,
      evmVersion: null,
      library: null,
      licenseType: null,
      proxy: false,
      implementation: null,
      swarmSource: null,
      nameChecked: true,
      nameCheckedAt: this.currentTime || Math.floor(Date.now() / 1000),
      lastUpdated: this.currentTime || Math.floor(Date.now() / 1000)
    }));

    if (alreadyVerified.length > 0) {
      this.log(`✅ Using ${alreadyVerified.length} cached verified contracts`);
    }

    // If all contracts are cached, return early
    if (needsVerification.length === 0) {
      this.log(`📊 All contracts already verified (from cache)`);
      return verifiedContracts;
    }

    this.log(`🔍 Verifying ${needsVerification.length} new contracts with batch processing...`);

    const batchSize = 5; // Process 5 contracts concurrently (Etherscan rate limit: 5/sec)
    const { getContractNameWithProxy } = require('../common');
    
    // Process in batches for better performance (only unverified contracts)
    for (let i = 0; i < needsVerification.length; i += batchSize) {
      const batch = needsVerification.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(needsVerification.length / batchSize);
      
      this.log(`📦 Processing verification batch ${batchNum}/${totalBatches} (${batch.length} contracts)`);
      
      // Create promises for parallel verification
      const batchPromises = batch.map(async (contract) => {
        const contractAddr = contract.address || contract;
        
        try {
          const result = await this.etherscanCall({
            module: 'contract',
            action: 'getsourcecode',
            address: contractAddr
          });
          
          if (!result || !Array.isArray(result) || result.length === 0) {
            return {
              address: contractAddr,
              network: this.network,
              verified: false,
              error: 'Invalid API response'
            };
          }
          
          const sourceData = result[0];
          if (!sourceData.SourceCode || sourceData.SourceCode === '') {
            return {
              address: contractAddr,
              network: this.network,
              verified: false,
              error: 'Source code not verified'
            };
          }
          
          // Get contract name with proxy resolution
          const finalContractName = await getContractNameWithProxy(this, contractAddr, sourceData);
          
          return {
            address: contractAddr,
            network: this.network,
            verified: true,
            contractName: finalContractName || sourceData.ContractName || 'Unknown',
            codeHash: contract.codeHash || null,  // Preserve codeHash from input
            deployTime: null,  // Will be fetched separately by fetchDeploymentTimesAsync
            needsDeploymentTime: true,  // Flag that this contract needs deployment time
            sourceCode: sourceData.SourceCode,
            abi: sourceData.ABI ? JSON.parse(sourceData.ABI) : null,
            compilerVersion: sourceData.CompilerVersion || null,
            optimization: sourceData.OptimizationUsed === '1',
            runs: parseInt(sourceData.Runs) || 0,
            constructorArguments: sourceData.ConstructorArguments || null,
            evmVersion: sourceData.EVMVersion || 'default',
            library: sourceData.Library || null,
            licenseType: sourceData.LicenseType || null,
            proxy: sourceData.Proxy === '1',
            implementation: sourceData.Implementation || null,
            swarmSource: sourceData.SwarmSource || null,
            nameChecked: true,
            nameCheckedAt: this.currentTime || Math.floor(Date.now() / 1000),
            lastUpdated: this.currentTime || Math.floor(Date.now() / 1000)
          };
        } catch (error) {
          return {
            address: contractAddr,
            network: this.network,
            verified: false,
            error: error.message
          };
        }
      });
      
      // Wait for all promises in batch to complete
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process batch results
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          const contractData = result.value;
          
          if (contractData.verified) {
            verifiedContracts.push(contractData);
            this.log(`✅ Verified: ${contractData.address} (${contractData.contractName})`);
          } else {
            // Push unverified contract with default values
            const unverifiedContract = {
              address: contractData.address,
              network: this.network,
              verified: false,
              contractName: null,
              codeHash: null,
              deployTime: null,
              needsDeploymentTime: false,  // Don't fetch deployment time for unverified contracts
              sourceCode: null,
              abi: null,
              compilerVersion: null,
              optimization: false,
              runs: 0,
              constructorArguments: null,
              evmVersion: null,
              library: null,
              licenseType: null,
              proxy: false,
              implementation: null,
              swarmSource: null,
              nameChecked: false,
              nameCheckedAt: 0,
              lastUpdated: this.currentTime || Math.floor(Date.now() / 1000)
            };
            
            verifiedContracts.push(unverifiedContract);
            
            if (contractData.error && !contractData.error.includes('Source code not verified')) {
              this.log(`⚠️ ${contractData.address}: ${contractData.error}`, 'warn');
            }
          }
        } else {
          // Handle rejected promise - add as unverified
          const contractAddr = batch[batchResults.indexOf(result)].address || batch[batchResults.indexOf(result)];
          verifiedContracts.push({
            address: contractAddr,
            network: this.network,
            verified: false,
            contractName: null,
            codeHash: null,
            deployTime: null,
            needsDeploymentTime: false,  // Don't fetch deployment time for failed contracts
            sourceCode: null,
            abi: null,
            compilerVersion: null,
            optimization: false,
            runs: 0,
            constructorArguments: null,
            evmVersion: null,
            library: null,
            licenseType: null,
            proxy: false,
            implementation: null,
            swarmSource: null,
            nameChecked: false,
            nameCheckedAt: 0,
            lastUpdated: this.currentTime || Math.floor(Date.now() / 1000)
          });
          
          this.log(`❌ Verification failed for contract: ${result.reason}`, 'error');
        }
      }
      
      // Delay between batches to respect rate limits (5 requests/sec) (skip if using proxy)
      const useEtherscanProxy = process.env.USE_ETHERSCAN_PROXY === 'true';
      if (!useEtherscanProxy && i + batchSize < needsVerification.length) {
        await this.sleep(1000); // 1 second delay between batches for safety
      }
    }

    const verified = verifiedContracts.filter(c => c.verified).length;
    this.log(`📊 Verification complete: ${verified}/${contracts.length} verified (${alreadyVerified.length} from cache, ${needsVerification.length} newly verified)`);
    
    this.stats.contractsFound = contracts.length;
    this.stats.contractsVerified = verified;
    this.stats.contractsUnverified = contracts.length - verified;
    
    return verifiedContracts;
  }

  async storeResults(eoas, verifiedContracts, selfDestructed = []) {
    this.log(`Storing ${eoas.length + verifiedContracts.length + selfDestructed.length} addresses...`);

    // Prepare EOA data with normalized addresses
    const eoaData = eoas.map(eoa => ({
      address: normalizeAddress(eoa.address),
      network: this.network,
      codeHash: null,
      deployed: null,
      tags: ['EOA'],
      contractName: null,
      lastUpdated: this.currentTime,
      firstSeen: this.currentTime,
      fund: 0,
      lastFundUpdated: 0,
      nameChecked: false,
      nameCheckedAt: 0
    }));

    // Prepare contract data with normalized addresses and balance information
    const contractData = verifiedContracts.map(contract => {
      // Convert BigInt balance to string for database storage
      const balanceValue = contract.balance ? contract.balance.toString() : '0';

      return {
        address: normalizeAddress(contract.address),
        network: this.network,
        codeHash: contract.codeHash,
        // IMPORTANT: Keep deployed as null if we couldn't get valid deployment time
        // Never use currentTime as a fallback for deployed field
        deployed: (contract.deployTime && contract.deployTime > 0) ? contract.deployTime : null,
        tags: contract.verified ? ['Contract', 'Verified'] : ['Contract', 'Unverified'],
        contractName: contract.contractName,
        lastUpdated: this.currentTime,
        firstSeen: this.currentTime,
        fund: balanceValue,
        lastFundUpdated: this.currentTime,
        nameChecked: contract.verified || false,
        nameCheckedAt: contract.verified ? this.currentTime : 0
      };
    });

    // Prepare self-destroyed contract data
    const selfDestroyedData = selfDestructed.map(item => ({
      address: normalizeAddress(item.address),
      network: this.network,
      codeHash: item.codeHash, // Keep original code hash for reference
      deployed: null,
      tags: item.tags || ['Contract', 'SelfDestroyed'],
      contractName: item.contractName || 'Self-Destroyed Contract',
      lastUpdated: this.currentTime,
      firstSeen: this.currentTime,
      fund: 0,
      lastFundUpdated: 0,
      nameChecked: true,
      nameCheckedAt: this.currentTime
    }));

    // Batch insert all data
    const allData = [...eoaData, ...contractData, ...selfDestroyedData];
    
    if (allData.length > 0) {
      await batchUpsertAddresses(this.db, allData, { batchSize: 250 }); // Smaller batch for complex data with more fields
    }
    
    this.log(`✅ Stored: ${eoaData.length} EOAs, ${contractData.length} contracts, ${selfDestroyedData.length} self-destroyed`);
    
    return {
      eoasStored: eoaData.length,
      contractsStored: contractData.length,
      selfDestroyedStored: selfDestroyedData.length,
      totalStored: allData.length
    };
  }

  /**
   * Execute the streaming pipeline with parallel processing
   * @param {number} fromBlock - Starting block number
   * @param {number} toBlock - Ending block number
   * @returns {Object} Pipeline results with processed addresses and total count
   */
  async executeStreamingPipeline(fromBlock, toBlock) {
    const processedAddresses = new Set();
    let batchCount = 0;
    let totalProcessed = 0;
    
    // Queue for async processing
    const processingQueue = [];
    const maxProcessingQueue = PROCESSING.MAX_CONCURRENT_PROCESSING;
    
    // Adaptive batch sizing parameters
    // Use network-specific optimization config if available, otherwise use global defaults
    const logsOptimization = this.config?.logsOptimization || {
      initialBatchSize: BATCH_SIZES.LOGS_DEFAULT,
      minBatchSize: BATCH_SIZES.LOGS_MIN,
      maxBatchSize: BATCH_SIZES.LOGS_MAX,
      targetDuration: PERFORMANCE.TARGET_DURATION,
      targetLogsPerRequest: 10000,
      fastMultiplier: PERFORMANCE.FAST_MULTIPLIER,
      slowMultiplier: PERFORMANCE.SLOW_MULTIPLIER
    };

    // Cap maxBatchSize to Alchemy tier limits
    const maxBatchSize = Math.min(logsOptimization.maxBatchSize, this.maxLogsBlockRange || 1000);
    const minBatchSize = logsOptimization.minBatchSize;
    let currentBatchSize = Math.min(logsOptimization.initialBatchSize, maxBatchSize);

    this.log(`Batch size limits: ${minBatchSize}-${maxBatchSize} blocks (initial: ${currentBatchSize}, Alchemy ${this.alchemyTier} tier)`);

    let currentBlock = fromBlock;
    
    while (currentBlock <= toBlock || processingQueue.length > 0) {
      // Fetch logs synchronously if we have capacity in processing queue
      if (currentBlock <= toBlock && processingQueue.length < maxProcessingQueue) {
        const result = await this.fetchAndQueueBatch(
          currentBlock, toBlock, currentBatchSize, minBatchSize, maxBatchSize,
          batchCount + 1, processedAddresses, processingQueue, logsOptimization
        );

        currentBlock = result.nextBlock;
        currentBatchSize = result.newBatchSize;
        batchCount = result.batchCount;
        totalProcessed += result.totalProcessed;
      }
      
      // Process completed tasks from the queue
      if (processingQueue.length >= maxProcessingQueue || (currentBlock > toBlock && processingQueue.length > 0)) {
        await this.processCompletedTasks(processingQueue);
      }
    }
    
    return { 
      processedAddresses: processedAddresses.size, 
      totalProcessed 
    };
  }

  /**
   * Fetch a batch of logs and queue for processing
   */
  async fetchAndQueueBatch(currentBlock, toBlock, currentBatchSize, minBatchSize, maxBatchSize, batchNum, processedAddresses, processingQueue, logsOptimization) {
    const endBlock = Math.min(currentBlock + currentBatchSize - 1, toBlock);

    // Check if this is a single block and it's permanently excluded
    if (currentBatchSize === 1 && this.permanentlyExcludedBlocks.has(currentBlock)) {
      this.log(`⏭️  Skipping permanently excluded block ${currentBlock}`, 'info');
      return {
        nextBlock: currentBlock + 1,
        newBatchSize: minBatchSize,
        batchCount: batchNum,
        totalProcessed: 0
      };
    }

    this.log(`Fetching batch ${batchNum}: blocks ${currentBlock}-${endBlock} (${endBlock - currentBlock + 1} blocks)`);

    try {
      // Fetch logs with timeout
      const result = await this.fetchLogsWithAdaptiveBatching(currentBlock, endBlock);

      // Adjust batch size based on performance using network-specific optimization
      const newBatchSize = this.adjustBatchSize(currentBatchSize, result.duration, result.logCount, minBatchSize, maxBatchSize, logsOptimization);

      // Filter and queue new addresses for processing
      const newAddresses = Array.from(result.addresses).filter(addr => !processedAddresses.has(addr));
      newAddresses.forEach(addr => processedAddresses.add(addr));

      let totalProcessed = 0;
      if (newAddresses.length > 0) {
        this.log(`📦 Batch ${batchNum}: ${newAddresses.length} new addresses queued`);

        const processingPromise = this.processAddressBatch(newAddresses, batchNum)
          .then(result => {
            totalProcessed += result.total || 0;
            return { batchNum, ...result };
          });

        processingQueue.push(processingPromise);
      }

      return {
        nextBlock: endBlock + 1,  // Move to next block only if successful
        newBatchSize,
        batchCount: batchNum,
        totalProcessed
      };
      
    } catch (error) {
      return await this.handleBatchError(error, currentBlock, endBlock, currentBatchSize, minBatchSize, batchNum, logsOptimization);
    }
  }

  /**
   * Fetch logs with adaptive batching and timeout handling
   */
  async fetchLogsWithAdaptiveBatching(currentBlock, endBlock) {
    const startTime = Date.now();
    this.log(`📥 Calling getLogs for blocks ${currentBlock}-${endBlock} (timeout: 20s)...`);
    
    try {
      const logs = await withTimeoutAndRetry(
        () => this.getLogs({
          fromBlock: `0x${currentBlock.toString(16)}`,
          toBlock: `0x${endBlock.toString(16)}`,
          topics: [this.transferEvent]
        }),
        TIMEOUTS.GET_LOGS,
        {
          operationName: `getLogs(${currentBlock}-${endBlock})`,
          maxAttempts: 2 // Fewer retries for logs to avoid long delays
        }
      );
      const duration = Date.now() - startTime;
      this.log(`✅ getLogs completed in ${duration}ms`);
      
      // Parse addresses from logs with normalization
      const addresses = new Set();
      logs.forEach(log => {
        addresses.add(normalizeAddress(log.address));
        if (log.topics[1]) addresses.add(normalizeAddress('0x' + log.topics[1].slice(26)));
        if (log.topics[2]) addresses.add(normalizeAddress('0x' + log.topics[2].slice(26)));
      });
      
      this.log(`Fetched ${logs.length} logs with ${addresses.size} unique addresses in ${duration}ms`);

      // Update log density statistics for learning
      await this.updateLogDensityStats(endBlock - currentBlock + 1, logs.length);

      return { addresses, duration, logCount: logs.length };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log(`❌ getLogs failed after ${duration}ms: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Adjust batch size based on response time and log count using network-specific optimization
   */
  adjustBatchSize(currentBatchSize, duration, logCount, minBatchSize, maxBatchSize, logsOptimization) {
    const targetDuration = logsOptimization.targetDuration;
    const targetLogsPerRequest = logsOptimization.targetLogsPerRequest;
    const fastMultiplier = logsOptimization.fastMultiplier;
    const slowMultiplier = logsOptimization.slowMultiplier;

    // Fast response - increase aggressively
    if (duration < targetDuration / 3) {
      const newBatchSize = Math.min(maxBatchSize, Math.floor(currentBatchSize * fastMultiplier));
      if (newBatchSize > currentBatchSize) {
        this.log(`Fast response (${duration}ms, ${logCount} logs). Increasing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
        return newBatchSize;
      }
    }
    // Good response - increase moderately
    else if (duration < targetDuration) {
      const ratio = targetDuration / duration;
      const newBatchSize = Math.min(maxBatchSize, Math.floor(currentBatchSize * Math.min(ratio, 1.5)));
      if (newBatchSize > currentBatchSize * 1.2) {
        this.log(`Good response (${duration}ms, ${logCount} logs). Increasing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
        return newBatchSize;
      }
    }
    // Very slow response - reduce aggressively
    else if (duration > targetDuration * 3) {
      const newBatchSize = Math.max(minBatchSize, Math.floor(currentBatchSize * slowMultiplier));
      this.log(`Very slow response (${duration}ms, ${logCount} logs). Reducing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
      return newBatchSize;
    }
    // Slow response - reduce moderately
    else if (duration > targetDuration * 1.5) {
      const newBatchSize = Math.max(minBatchSize, Math.floor(currentBatchSize * slowMultiplier));
      if (newBatchSize < currentBatchSize * 0.8) {
        this.log(`Slow response (${duration}ms, ${logCount} logs). Reducing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
        return newBatchSize;
      }
    }

    // Also consider log count - if we're getting close to response size limit
    if (logCount > targetLogsPerRequest * 0.8 && currentBatchSize > minBatchSize) {
      const newBatchSize = Math.max(minBatchSize, Math.floor(currentBatchSize * 0.8));
      this.log(`High log count (${logCount} logs, target: ${targetLogsPerRequest}). Reducing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
      return newBatchSize;
    }

    return currentBatchSize;
  }

  /**
   * Update log density statistics with new sample
   * @param {number} blockCount - Number of blocks in this sample
   * @param {number} logCount - Number of logs returned
   */
  async updateLogDensityStats(blockCount, logCount) {
    if (blockCount <= 0) return;

    const logsPerBlock = logCount / blockCount;

    // Add sample to array
    this.logDensityStats.samples.push({
      blocks: blockCount,
      logs: logCount,
      logsPerBlock: logsPerBlock,
      timestamp: Date.now()
    });

    // Keep only recent samples
    if (this.logDensityStats.samples.length > this.MAX_SAMPLES) {
      this.logDensityStats.samples.shift();
    }

    // Update running statistics
    this.logDensityStats.totalLogs += logCount;
    this.logDensityStats.totalBlocks += blockCount;
    this.logDensityStats.sampleCount++;
    this.logDensityStats.avgLogsPerBlock =
      this.logDensityStats.totalLogs / this.logDensityStats.totalBlocks;
    this.logDensityStats.minLogsPerBlock =
      Math.min(this.logDensityStats.minLogsPerBlock, logsPerBlock);
    this.logDensityStats.maxLogsPerBlock =
      Math.max(this.logDensityStats.maxLogsPerBlock, logsPerBlock);

    // Periodically save to database
    if (this.logDensityStats.sampleCount % this.SAVE_STATS_INTERVAL === 0) {
      await this.saveLogDensityStats();
    }
  }

  /**
   * Save log density statistics to database
   */
  async saveLogDensityStats() {
    try {
      const stats = this.logDensityStats;

      // Calculate standard deviation
      const mean = stats.avgLogsPerBlock;
      const squaredDiffs = stats.samples.map(s => Math.pow(s.logsPerBlock - mean, 2));
      const stddev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / stats.samples.length);

      // Determine optimal batch size based on avg logs per block
      // Target: ~8000 logs per request (80% of 10K limit)
      const targetLogs = 8000;
      const optimalBatchSize = Math.max(10, Math.floor(targetLogs / stats.avgLogsPerBlock));

      // Recommend profile based on log density
      let recommendedProfile;
      if (stats.avgLogsPerBlock >= 150) {
        recommendedProfile = 'ultra-high-density';
      } else if (stats.avgLogsPerBlock >= 50) {
        recommendedProfile = 'high-density';
      } else if (stats.avgLogsPerBlock >= 20) {
        recommendedProfile = 'medium-density';
      } else {
        recommendedProfile = 'low-density';
      }

      const query = `
        INSERT INTO network_log_density_stats (
          network, avg_logs_per_block, stddev_logs_per_block,
          min_logs_per_block, max_logs_per_block, optimal_batch_size,
          recommended_profile, sample_count, total_logs_sampled,
          total_blocks_sampled, last_updated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
        ON CONFLICT (network) DO UPDATE SET
          avg_logs_per_block = $2,
          stddev_logs_per_block = $3,
          min_logs_per_block = $4,
          max_logs_per_block = $5,
          optimal_batch_size = $6,
          recommended_profile = $7,
          sample_count = network_log_density_stats.sample_count + $8,
          total_logs_sampled = network_log_density_stats.total_logs_sampled + $9,
          total_blocks_sampled = network_log_density_stats.total_blocks_sampled + $10,
          last_updated = NOW()
      `;

      await this.queryDB(query, [
        this.network,
        stats.avgLogsPerBlock.toFixed(2),
        stddev.toFixed(2),
        Math.floor(stats.minLogsPerBlock),
        Math.ceil(stats.maxLogsPerBlock),
        optimalBatchSize,
        recommendedProfile,
        stats.sampleCount,
        stats.totalLogs,
        stats.totalBlocks
      ]);

      this.log(`📊 Saved log density stats: avg=${stats.avgLogsPerBlock.toFixed(2)} logs/block, ` +
               `optimal batch=${optimalBatchSize}, profile=${recommendedProfile}`);

      stats.lastSaved = Date.now();

      // Reset counters for next interval
      stats.sampleCount = 0;
      stats.totalLogs = 0;
      stats.totalBlocks = 0;

    } catch (error) {
      this.log(`⚠️ Failed to save log density stats: ${error.message}`, 'warn');
    }
  }

  /**
   * Load log density statistics from database
   */
  async loadLogDensityStats() {
    try {
      const query = `
        SELECT
          avg_logs_per_block,
          stddev_logs_per_block,
          min_logs_per_block,
          max_logs_per_block,
          optimal_batch_size,
          recommended_profile,
          sample_count,
          total_logs_sampled,
          total_blocks_sampled,
          last_updated
        FROM network_log_density_stats
        WHERE network = $1
      `;

      const result = await this.queryDB(query, [this.network]);

      if (result.rows.length > 0) {
        const row = result.rows[0];

        this.log(`📊 Loaded log density stats from DB:`);
        this.log(`   Avg: ${row.avg_logs_per_block} logs/block (range: ${row.min_logs_per_block}-${row.max_logs_per_block})`);
        this.log(`   Optimal batch: ${row.optimal_batch_size} blocks`);
        this.log(`   Recommended profile: ${row.recommended_profile}`);
        this.log(`   Samples: ${row.sample_count.toLocaleString()} (${row.total_blocks_sampled.toLocaleString()} blocks)`);

        // Initialize stats with loaded values
        this.logDensityStats.avgLogsPerBlock = parseFloat(row.avg_logs_per_block);
        this.logDensityStats.minLogsPerBlock = parseInt(row.min_logs_per_block);
        this.logDensityStats.maxLogsPerBlock = parseInt(row.max_logs_per_block);
        this.logDensityStats.sampleCount = parseInt(row.sample_count);
        this.logDensityStats.totalBlocks = parseInt(row.total_blocks_sampled);
        this.logDensityStats.totalLogs = parseInt(row.total_logs_sampled);
        this.logDensityStats.loadedFromDB = true; // Mark as loaded from DB

        return {
          avgLogsPerBlock: parseFloat(row.avg_logs_per_block),
          optimalBatchSize: parseInt(row.optimal_batch_size),
          recommendedProfile: row.recommended_profile,
          avg_logs_per_block: parseFloat(row.avg_logs_per_block),
          optimal_batch_size: parseInt(row.optimal_batch_size),
          recommended_profile: row.recommended_profile,
          sample_count: parseInt(row.sample_count)
        };
      } else {
        this.log(`📊 No existing log density stats found for ${this.network}`);
        return null;
      }
    } catch (error) {
      this.log(`⚠️ Failed to load log density stats: ${error.message}`, 'warn');
      return null;
    }
  }

  /**
   * Apply learned optimizations based on historical data
   * @param {object} learnedStats - Statistics loaded from database
   */
  applyLearnedOptimizations(learnedStats) {
    if (!learnedStats || !this.logsOptimization) return;

    this.log(`🧠 Applying learned optimizations:`);

    // Adjust initial batch size based on optimal learned value
    const optimalBatch = learnedStats.optimalBatchSize;
    const currentInitial = this.logsOptimization.initialBatchSize;

    // Apply learned optimal batch size, but respect tier limits
    if (optimalBatch && optimalBatch !== currentInitial) {
      // Ensure it's within min/max bounds
      const adjustedBatch = Math.max(
        this.logsOptimization.minBatchSize,
        Math.min(this.logsOptimization.maxBatchSize, optimalBatch)
      );

      if (adjustedBatch !== currentInitial) {
        this.log(`   Initial batch: ${currentInitial} → ${adjustedBatch} (learned optimal)`);
        this.logsOptimization.initialBatchSize = adjustedBatch;
      }
    }

    // Check if recommended profile differs from current profile
    const currentProfile = this.getActivityProfileName(this.config.logsOptimization);
    const recommendedProfile = learnedStats.recommendedProfile;

    if (recommendedProfile && recommendedProfile !== currentProfile) {
      this.log(`   ⚠️ Profile mismatch detected!`);
      this.log(`   Current: ${currentProfile}, Recommended: ${recommendedProfile}`);
      this.log(`   Consider updating network config to use '${recommendedProfile}' profile`);

      // Optionally apply recommended profile (commented out for safety)
      // const { getLogsOptimization } = require('../config/networks.js');
      // this.logsOptimization = getLogsOptimization(recommendedProfile, this.alchemyTier);
    }

    // Adjust target logs if we have reliable average data
    if (learnedStats.avgLogsPerBlock > 0) {
      const safetyMargin = 0.8; // 80% of 10K limit
      const newTargetLogs = Math.floor(9000 / learnedStats.avgLogsPerBlock) * learnedStats.avgLogsPerBlock * safetyMargin;

      if (newTargetLogs > 5000 && newTargetLogs < 9000) {
        this.log(`   Target logs: ${this.logsOptimization.targetLogsPerRequest} → ${Math.floor(newTargetLogs)} (density-adjusted)`);
        this.logsOptimization.targetLogsPerRequest = Math.floor(newTargetLogs);
      }
    }
  }

  /**
   * Handle batch processing errors
   */
  async handleBatchError(error, currentBlock, endBlock, currentBatchSize, minBatchSize, batchNum, logsOptimization) {
    const blockKey = `${currentBlock}-${endBlock}`;
    const retryCount = this.blockRetryCount.get(blockKey) || 0;
    
    if (error.message.includes('timeout')) {
      // Check if we've retried too many times for this block range
      if (retryCount >= 5) {
        this.log(`Batch ${batchNum} exceeded max retries (5) for blocks ${currentBlock}-${endBlock}. Skipping...`, 'error');
        this.blockRetryCount.delete(blockKey);
        return {
          nextBlock: endBlock + 1, // Skip this batch after max retries
          newBatchSize: currentBatchSize,
          batchCount: batchNum,
          totalProcessed: 0
        };
      }
      
      // If batch size is already 1 and still failing, permanently exclude after 3 retries
      if (currentBatchSize === 1 && retryCount >= 3) {
        this.log(`Single block ${currentBlock} failed after 3 retries. Permanently excluding...`, 'error');
        this.blockRetryCount.delete(blockKey);

        // Permanently exclude this block
        await this.permanentlyExcludeBlock(currentBlock, `getLogs timeout after ${retryCount} retries`);

        return {
          nextBlock: currentBlock + 1, // Skip this single block
          newBatchSize: minBatchSize,
          batchCount: batchNum,
          totalProcessed: 0
        };
      }
      
      this.blockRetryCount.set(blockKey, retryCount + 1);
      this.log(`Batch ${batchNum} fetch timeout (retry ${retryCount + 1}/5)`, 'warn');

      // Note: Alchemy RPC handles load balancing internally, no manual RPC switching needed

      const newBatchSize = Math.max(minBatchSize, Math.floor(currentBatchSize * 0.5));
      if (newBatchSize < currentBatchSize) {
        this.log(`Reducing batch size from ${currentBatchSize} to ${newBatchSize}: blocks ${currentBlock}-${endBlock}`, 'info');
      }
      
      return {
        nextBlock: currentBlock, // Retry with smaller batch
        newBatchSize,
        batchCount: batchNum - 1, // Don't increment batch count
        totalProcessed: 0
      };
    } else if (error.message.includes('query returned more than 10000 results') || 
               error.message.includes('query returned more than') ||
               error.message.includes('Try with this block range')) {
      // Too many results error - need smaller batch size
      const newBatchSize = Math.max(1, Math.floor(currentBatchSize * 0.5));
      this.log(`Batch ${batchNum} has too many results. Reducing batch size from ${currentBatchSize} to ${newBatchSize}`, 'warn');
      
      // Extract suggested range if available
      const rangeMatch = error.message.match(/\[([0-9xa-fA-F]+),\s*([0-9xa-fA-F]+)\]/);
      if (rangeMatch) {
        const suggestedStart = parseInt(rangeMatch[1], 16);
        const suggestedEnd = parseInt(rangeMatch[2], 16);
        const suggestedSize = suggestedEnd - suggestedStart + 1;
        if (suggestedSize > 0 && suggestedSize < currentBatchSize) {
          this.log(`RPC suggested batch size: ${suggestedSize} blocks`, 'info');
          return {
            nextBlock: currentBlock,
            newBatchSize: Math.min(suggestedSize, newBatchSize),
            batchCount: batchNum - 1,
            totalProcessed: 0
          };
        }
      }
      
      return {
        nextBlock: currentBlock, // Retry with smaller batch
        newBatchSize,
        batchCount: batchNum - 1,
        totalProcessed: 0
      };
    } else if (error.message.includes('All RPC attempts failed')) {
      this.blockRetryCount.delete(blockKey);
      this.log(`Batch ${batchNum} failed - all RPC endpoints exhausted: ${error.message}`, 'error');

      // If this is a single block, permanently exclude it
      if (currentBatchSize === 1) {
        await this.permanentlyExcludeBlock(currentBlock, 'All RPC endpoints failed');
        this.log(`🚫 Permanently excluded block ${currentBlock} due to RPC failures`, 'warn');
      } else {
        this.log(`Skipping blocks ${currentBlock}-${endBlock} due to RPC failures`, 'warn');
      }

      return {
        nextBlock: endBlock + 1, // Skip this batch after all retries failed
        newBatchSize: Math.max(minBatchSize, Math.floor(currentBatchSize * 0.7)),
        batchCount: batchNum,
        totalProcessed: 0
      };
    } else if (error.message.includes('response size exceeded') ||
               error.message.includes('response too large') ||
               error.message.includes('max message size')) {
      // Response size limit error - reduce batch size aggressively
      this.blockRetryCount.delete(blockKey);
      const newBatchSize = Math.max(minBatchSize, Math.floor(currentBatchSize * (logsOptimization?.slowMultiplier || 0.5)));
      this.log(`Batch ${batchNum} exceeded response size limit (${error.message.slice(0, 100)}). Reducing batch size: ${currentBatchSize} → ${newBatchSize}`, 'warn');

      return {
        nextBlock: currentBlock, // Retry with smaller batch
        newBatchSize,
        batchCount: batchNum - 1,
        totalProcessed: 0
      };
    } else {
      this.blockRetryCount.delete(blockKey);
      this.log(`Batch ${batchNum} fetch failed: ${error.message}. Skipping...`, 'error');

      // If this is a single block, permanently exclude it
      if (currentBatchSize === 1) {
        await this.permanentlyExcludeBlock(currentBlock, `getLogs error: ${error.message.slice(0, 100)}`);
        this.log(`🚫 Permanently excluded block ${currentBlock} due to error`, 'warn');
      }

      return {
        nextBlock: endBlock + 1, // Skip this batch on other errors
        newBatchSize: currentBatchSize,
        batchCount: batchNum,
        totalProcessed: 0
      };
    }
  }

  /**
   * Process a batch of addresses through the complete pipeline
   */
  async processAddressBatch(addresses, batchNum) {
    if (addresses.length === 0) return { eoas: 0, contracts: 0, total: 0 };

    try {
      // Filter existing addresses
      const newAddresses = await this.filterExistingAddresses(addresses);

      if (newAddresses.length === 0) {
        return { eoas: 0, contracts: 0, total: 0 };
      }

      // Perform EOA filtering and contract detection
      const { eoas, contracts } = await this.performEOAFiltering(newAddresses);

      // OPTIMIZATION: Check balances first, then verify only contracts with funds
      let verifiedContracts = [];
      let contractsWithBalance = [];

      if (contracts.length > 0) {
        // Load token addresses from tokens/{network}.json
        const fs = require('fs');
        const path = require('path');
        const tokensFilePath = path.join(__dirname, '..', 'tokens', `${this.network}.json`);
        let tokenAddresses = [];

        try {
          const tokensData = JSON.parse(fs.readFileSync(tokensFilePath, 'utf8'));
          tokenAddresses = tokensData.map(t => t.address.toLowerCase()).filter(Boolean);
          this.log(`📋 Loaded ${tokenAddresses.length} token addresses for balance check`);
        } catch (error) {
          this.log(`⚠️ Failed to load tokens file: ${error.message}`, 'warn');
        }

        // Get balances for all contracts using BalanceHelper contract
        const contractAddresses = contracts.map(c => c.address);

        // Get native token balances
        const nativeBalances = await this.getNativeBalances(contractAddresses);

        // Get ERC20 token balances
        let erc20BalancesMap = new Map();
        if (tokenAddresses.length > 0) {
          try {
            erc20BalancesMap = await this.getERC20Balances(contractAddresses, tokenAddresses);
            this.log(`💰 Checked ERC20 balances for ${contractAddresses.length} contracts across ${tokenAddresses.length} tokens`);
          } catch (error) {
            this.log(`⚠️ ERC20 balance check failed: ${error.message}`, 'warn');
          }
        }

        // Separate contracts by balance (native OR ERC20)
        const contractsWithFunds = [];
        const contractsWithoutFunds = [];

        for (let i = 0; i < contracts.length; i++) {
          const contract = contracts[i];
          const address = contract.address.toLowerCase();

          // Check native balance
          const nativeBalanceStr = nativeBalances[i] || '0';
          const nativeBalance = BigInt(nativeBalanceStr);

          // Check ERC20 balances
          const erc20Balances = erc20BalancesMap.get(address) || new Map();
          const hasERC20 = Array.from(erc20Balances.values()).some(token => {
            const balance = BigInt(token.balance || '0');
            return balance > 0n;
          });

          if (nativeBalance > 0n || hasERC20) {
            contractsWithFunds.push({ ...contract, balance: nativeBalance });
          } else {
            contractsWithoutFunds.push({ ...contract, balance: 0n });
          }
        }

        this.log(`💰 Balance check: ${contractsWithFunds.length} contracts with funds (native or ERC20), ${contractsWithoutFunds.length} without funds`);

        // Only process contracts with balance > 0
        if (contractsWithFunds.length > 0) {
          // Verify contracts with funds
          this.log(`🔍 Verifying ${contractsWithFunds.length} contracts with funds (skipping ${contractsWithoutFunds.length} zero-balance contracts)`);
          verifiedContracts = await this.verifyContracts(contractsWithFunds);
          
          // Fetch deployment times for verified contracts (MUST await before storing)
          await this.fetchDeploymentTimesAsync(verifiedContracts);
        }

        // Only store contracts with balance (skip zero-balance contracts)
        contractsWithBalance = verifiedContracts;

        if (contractsWithoutFunds.length > 0) {
          this.log(`⏭️  Skipping DB storage for ${contractsWithoutFunds.length} zero-balance contracts`);
        }
      }

      // Store results with balance information
      await this.storeResults(eoas, contractsWithBalance);

      this.log(`✅ Batch ${batchNum}: ${eoas.length} EOAs, ${contractsWithBalance.length} contracts (${verifiedContracts.length} verified)`);

      return {
        eoas: eoas.length,
        contracts: contractsWithBalance.length,
        total: newAddresses.length
      };
    } catch (error) {
      this.log(`Batch ${batchNum} processing failed: ${error.message}`, 'error');
      return { eoas: 0, contracts: 0, total: 0, error: true };
    }
  }

  /**
   * Process completed tasks from the queue
   */
  async processCompletedTasks(processingQueue) {
    // Wait for at least one processing task to complete
    const completedIndex = await Promise.race(
      processingQueue.map((p, i) => p.then(() => i))
    );
    
    const completed = processingQueue[completedIndex];
    processingQueue.splice(completedIndex, 1);
    
    const result = await completed;
    if (!result.error) {
      this.log(`✅ Batch ${result.batchNum}: ${result.eoas} EOAs, ${result.contracts} contracts processed`);
    }
  }

  async run() {
    this.log('🚀 Starting unified blockchain analysis pipeline');

    // Load permanently excluded blocks
    await this.loadPermanentlyExcludedBlocks();

    // Get target block range
    const { fromBlock, toBlock } = await this.getTargetBlocks();
    
    // Execute streaming pipeline with parallel processing
    const { processedAddresses, totalProcessed } = await this.executeStreamingPipeline(fromBlock, toBlock);
    
    // Update stats
    this.stats.transferAddresses = processedAddresses;
    this.stats.newAddresses = totalProcessed;

    // Final statistics
    this.log(`🎯 PIPELINE COMPLETE`);
    this.log(`📊 Addresses: ${this.stats.transferAddresses} found, ${this.stats.newAddresses} processed`);
    this.log(`📝 Contracts: ${this.stats.contractsFound} found, ${this.stats.contractsVerified} verified, ${this.stats.contractsUnverified} unverified`);
    this.log(`👤 EOAs: ${this.stats.eoaFiltered} identified`);
  }

  /**
   * Override cleanup to save final statistics
   */
  async cleanup() {
    // Save final log density statistics if we have any samples
    if (this.logDensityStats && this.logDensityStats.sampleCount > 0) {
      this.log(`💾 Saving final log density statistics...`);
      await this.saveLogDensityStats();
    }

    // Call parent cleanup
    await super.cleanup();
  }
}

// Execute if run directly
if (require.main === module) {
  // Ensure process exits after completion
  process.env.AUTO_EXIT = 'true';
  
  // Force exit after timeout if process doesn't terminate
  const timeoutSeconds = parseInt(process.env.TIMEOUT_SECONDS || '7200', 10);
  const forceExit = setTimeout(() => {
    console.log(`⚠️ Force terminating process (${timeoutSeconds}s timeout)`);
    process.exit(0);
  }, timeoutSeconds * 1000);
  
  const scanner = new UnifiedScanner();
  scanner.execute()
    .then(() => {
      console.log('✅ UnifiedScanner completed successfully');
      clearTimeout(forceExit);
      // Scanner base class will handle process.exit(0)
    })
    .catch(error => {
      console.error('❌ Scanner failed:', error);
      clearTimeout(forceExit);
      process.exit(1);
    });
}

module.exports = UnifiedScanner;
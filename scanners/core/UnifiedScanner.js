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
const CONFIG = require('../config/networks.js');

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
    
    this.timeDelay = CONFIG.TIMEDELAY || 4;
    this.transferEvent = BLOCKCHAIN_CONSTANTS.TRANSFER_EVENT;
    
    
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
    
    const eoas = [];
    const contracts = [];
    const selfDestructed = [];
    
    // Process each address with enhanced classification
    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      const isContract = contractFlags[i];
      const codeHash = codeHashes[i] || null;
      
      if (isContract && codeHash && codeHash !== this.ZERO_HASH) {
        // Active contract - first get actual deployment time
        let deployTime = null;
        
        let isGenesisContract = false;
        try {
          // First try to get from database if available
          const existingQuery = `SELECT deployed FROM addresses WHERE address = $1 AND network = $2`;
          const existingResult = await this.queryDB(existingQuery, [address, this.network]);
          
          if (existingResult.rows.length > 0 && existingResult.rows[0].deployed != 0) {
            deployTime = existingResult.rows[0].deployed;
          } else {
            // Use the dedicated deployment time function
            const { getContractDeploymentTime } = require('../common');
            const deploymentResult = await getContractDeploymentTime(this, address);
            deployTime = deploymentResult.timestamp;
            isGenesisContract = deploymentResult.isGenesis;
          }
        } catch (dbError) {
          this.log(`⚠️ Database error getting deployment time for ${address} - skipping`, 'warn');
          continue;
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
          // Smart Contract - deployment time already retrieved above
          this.log(`📍 Contract ${address} deployment time: ${new Date(deployTime * 1000).toISOString()}`);
          
          contracts.push({
            address,
            codeHash,
            deployTime,
            type: 'smart_contract',
            isGenesis: isGenesisContract
          });
        } else {
          // Unknown type - skip completely to avoid uncertain data
          this.log(`⚠️ Unknown address type for ${address} - skipping (uncertain data)`, 'warn');
          continue;
        }
      } else if (codeHash && codeHash !== this.ZERO_HASH) {
        // Has code hash in DB but no current code - self-destroyed contract
        selfDestructed.push({
          address,
          codeHash,
          type: 'self_destroyed',
          contractName: 'Self-Destroyed Contract',
          tags: ['Contract', 'SelfDestroyed']
        });
      } else {
        // True EOA
        eoas.push({ address, codeHash: null, isContract: false });
      }
    }
    
    this.log(`Simplified filtering: ${eoas.length} EOAs (including EIP-7702), ${contracts.length} smart contracts, ${selfDestructed.length} self-destroyed`);
    
    return { eoas, contracts, selfDestructed };
  }




  async verifyContracts(contracts = []) {
    if (contracts.length === 0) return [];
    
    this.log(`🔍 Verifying ${contracts.length} contracts...`);
    
    const verifiedContracts = [];
    
    for (const contract of contracts) {
      try {
        // Direct etherscan call without withEtherscanRetry
        const result = await this.etherscanCall({
          module: 'contract',
          action: 'getsourcecode',
          address: contract.address || contract
        });
        
        if (!result || !Array.isArray(result) || result.length === 0) {
          this.log(`⚠️ Verification error for ${contract.address || contract}: Invalid API response format`);
          continue;
        }
        
        const sourceData = result[0];
        if (!sourceData.SourceCode || sourceData.SourceCode === '') {
          this.log(`⚠️ Contract ${contract.address || contract} source code not verified`);
          continue;
        }
        
        // Get contract name with proxy resolution
        const { getContractNameWithProxy } = require('../common');
        const finalContractName = await getContractNameWithProxy(this, contract.address, sourceData);
        
        verifiedContracts.push({
          address: contract.address || contract, // Ensure address is always set
          network: this.network,
          verified: true,
          contractName: finalContractName || sourceData.ContractName || 'Unknown',
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
        });
        
        this.log(`✅ Verified: ${contract.address} (${sourceData.ContractName})`);
        
      } catch (error) {
        verifiedContracts.push({
          address: contract.address || contract, // Ensure address is always set
          network: this.network,
          verified: false,
          contractName: null,
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
          swarmSource: null
        });
        
        if (!error.message.includes('Contract source code not verified')) {
          this.log(`⚠️ Verification error for ${contract.address}: ${error.message}`, 'warn');
        }
      }
      
      await this.sleep(200);
    }
    
    const verified = verifiedContracts.filter(c => c.verified).length;
    this.log(`📊 Verification complete: ${verified}/${contracts.length} verified`);
    
    this.stats.contractsFound = contracts.length;
    this.stats.contractsVerified = verified;
    this.stats.contractsUnverified = contracts.length - verified;
    
    return verifiedContracts;
  }

  async validateRequiredContracts() {
    this.log('🔍 Validating required contracts...');
    
    // Check if BalanceHelper address is configured
    if (!this.config.BalanceHelper) {
      throw new Error(`❌ BalanceHelper contract address not configured for network ${this.network}. Please deploy the contract first.`);
    }
    
    // Check if contractValidator address is configured
    if (!this.config.contractValidator) {
      throw new Error(`❌ contractValidator contract address not configured for network ${this.network}. Please deploy the contract first.`);
    }
    
    this.log(`✅ BalanceHelper configured: ${this.config.BalanceHelper}`);
    this.log(`✅ contractValidator configured: ${this.config.contractValidator}`);
    this.log('🎯 All required contracts are configured');
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
    
    // Prepare contract data with normalized addresses
    const contractData = verifiedContracts.map(contract => ({
      address: normalizeAddress(contract.address),
      network: this.network,
      codeHash: contract.codeHash,
      deployed: contract.deployTime, // Should always be valid due to strict filtering
      tags: contract.verified ? ['Contract', 'Verified'] : ['Contract', 'Unverified'],
      contractName: contract.contractName,
      lastUpdated: this.currentTime,
      firstSeen: this.currentTime,
      fund: 0,
      lastFundUpdated: 0,
      nameChecked: contract.verified || false,
      nameCheckedAt: contract.verified ? this.currentTime : 0
    }));

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
    let currentBatchSize = BATCH_SIZES.LOGS_DEFAULT;
    const minBatchSize = BATCH_SIZES.LOGS_MIN;
    const maxBatchSize = BATCH_SIZES.LOGS_MAX;
    
    let currentBlock = fromBlock;
    
    while (currentBlock <= toBlock || processingQueue.length > 0) {
      // Fetch logs synchronously if we have capacity in processing queue
      if (currentBlock <= toBlock && processingQueue.length < maxProcessingQueue) {
        const result = await this.fetchAndQueueBatch(
          currentBlock, toBlock, currentBatchSize, minBatchSize, maxBatchSize,
          batchCount + 1, processedAddresses, processingQueue
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
  async fetchAndQueueBatch(currentBlock, toBlock, currentBatchSize, minBatchSize, maxBatchSize, batchNum, processedAddresses, processingQueue) {
    const endBlock = Math.min(currentBlock + currentBatchSize - 1, toBlock);
    this.log(`Fetching batch ${batchNum}: blocks ${currentBlock}-${endBlock} (${endBlock - currentBlock + 1} blocks)`);
    
    try {
      // Fetch logs with timeout
      const result = await this.fetchLogsWithAdaptiveBatching(currentBlock, endBlock);
      
      // Adjust batch size based on performance
      const newBatchSize = this.adjustBatchSize(currentBatchSize, result.duration, minBatchSize, maxBatchSize);
      
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
        nextBlock: endBlock + 1,
        newBatchSize,
        batchCount: batchNum,
        totalProcessed
      };
      
    } catch (error) {
      return this.handleBatchError(error, currentBlock, endBlock, currentBatchSize, minBatchSize, batchNum);
    }
  }

  /**
   * Fetch logs with adaptive batching and timeout handling
   */
  async fetchLogsWithAdaptiveBatching(currentBlock, endBlock) {
    const startTime = Date.now();
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
    
    // Parse addresses from logs with normalization
    const addresses = new Set();
    logs.forEach(log => {
      addresses.add(normalizeAddress(log.address));
      if (log.topics[1]) addresses.add(normalizeAddress('0x' + log.topics[1].slice(26)));
      if (log.topics[2]) addresses.add(normalizeAddress('0x' + log.topics[2].slice(26)));
    });
    
    this.log(`Fetched ${logs.length} logs with ${addresses.size} unique addresses in ${duration}ms`);
    
    return { addresses, duration, logCount: logs.length };
  }

  /**
   * Adjust batch size based on response time
   */
  adjustBatchSize(currentBatchSize, duration, minBatchSize, maxBatchSize) {
    if (duration < PERFORMANCE.FAST_RESPONSE) {
      const newBatchSize = Math.min(maxBatchSize, Math.floor(currentBatchSize * PERFORMANCE.FAST_MULTIPLIER));
      if (newBatchSize > currentBatchSize) {
        this.log(`Fast response (${duration}ms). Increasing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
        return newBatchSize;
      }
    } else if (duration < PERFORMANCE.TARGET_DURATION) {
      const ratio = PERFORMANCE.TARGET_DURATION / duration;
      const newBatchSize = Math.min(maxBatchSize, Math.floor(currentBatchSize * Math.min(ratio, PERFORMANCE.GOOD_MULTIPLIER)));
      if (newBatchSize > currentBatchSize * 1.2) {
        this.log(`Good response (${duration}ms). Increasing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
        return newBatchSize;
      }
    } else if (duration > PERFORMANCE.VERY_SLOW_RESPONSE) {
      const newBatchSize = Math.max(minBatchSize, Math.floor(currentBatchSize * PERFORMANCE.VERY_SLOW_MULTIPLIER));
      this.log(`Very slow response (${duration}ms). Reducing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
      return newBatchSize;
    } else if (duration > PERFORMANCE.SLOW_RESPONSE) {
      const newBatchSize = Math.max(minBatchSize, Math.floor(currentBatchSize * PERFORMANCE.SLOW_MULTIPLIER));
      if (newBatchSize < currentBatchSize * 0.8) {
        this.log(`Slow response (${duration}ms). Reducing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
        return newBatchSize;
      }
    }
    
    return currentBatchSize;
  }

  /**
   * Handle batch processing errors
   */
  handleBatchError(error, currentBlock, endBlock, currentBatchSize, minBatchSize, batchNum) {
    if (error.message.includes('timeout')) {
      this.log(`Batch ${batchNum} fetch timeout - RPC will automatically switch to next endpoint`, 'warn');
      this.log(`Reducing batch size from ${currentBatchSize} to retry: blocks ${currentBlock}-${endBlock}`, 'info');
      const newBatchSize = Math.max(minBatchSize, Math.floor(currentBatchSize * 0.5));
      return {
        nextBlock: currentBlock, // Don't increment, retry with smaller batch
        newBatchSize,
        batchCount: batchNum - 1, // Don't increment batch count
        totalProcessed: 0
      };
    } else if (error.message.includes('All RPC attempts failed')) {
      this.log(`Batch ${batchNum} failed - all RPC endpoints exhausted: ${error.message}`, 'error');
      this.log(`Skipping blocks ${currentBlock}-${endBlock} due to RPC failures`, 'warn');
      return {
        nextBlock: endBlock + 1, // Skip this batch after all retries failed
        newBatchSize: Math.max(minBatchSize, Math.floor(currentBatchSize * 0.7)), // Reduce size for next attempt
        batchCount: batchNum,
        totalProcessed: 0
      };
    } else {
      this.log(`Batch ${batchNum} fetch failed: ${error.message}. Skipping...`, 'error');
      return {
        nextBlock: endBlock + 1, // Skip this batch
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
      
      // Verify contracts
      const verifiedContracts = await this.verifyContracts(contracts);
      
      // Store results
      await this.storeResults(eoas, verifiedContracts);
      
      this.log(`✅ Batch ${batchNum}: ${eoas.length} EOAs, ${verifiedContracts.length} contracts`);
      
      return { 
        eoas: eoas.length, 
        contracts: verifiedContracts.length,
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

    // Validate required contracts before starting
    await this.validateRequiredContracts();

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
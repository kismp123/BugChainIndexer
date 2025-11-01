/* eslint-disable no-console */
/**
 * Unified Scanner Base Class
 * Consolidates all common scanner functionality
 */
const { NETWORKS, CONFIG, getLogsOptimization } = require('../config/networks.js');
const { 
  initializeDB, 
  closeDB, 
  sleep, 
  now,
  batchOperation,
  etherscanRequest,
  contractCall,
  createRpcClient
} = require('./core.js');
const { ensureSchema } = require('./database.js');

class Scanner {
  constructor(name, options = {}) {
    this.name = name;
    this.network = options.network || process.env.NETWORK || 'ethereum';
    this.config = NETWORKS[this.network];

    // Validate network configuration exists
    if (!this.config) {
      const availableNetworks = Object.keys(NETWORKS).join(', ');
      throw new Error(
        `Network '${this.network}' is not configured or has been disabled.\n` +
        `Available networks: ${availableNetworks}\n` +
        `If this network was recently disabled, please update your scripts to use active networks only.`
      );
    }

    // Get Alchemy tier from environment or will be auto-detected
    const envTier = process.env.ALCHEMY_TIER;
    if (envTier && ['free', 'growth', 'enterprise'].includes(envTier.toLowerCase())) {
      this.alchemyTier = envTier.toLowerCase();
      this.tierAutoDetect = false;
      this.log(`Using manual Alchemy tier: ${this.alchemyTier}`);
    } else {
      // Will auto-detect tier during initialization
      this.alchemyTier = null;
      this.tierAutoDetect = true;
      if (envTier) {
        this.log(`Invalid ALCHEMY_TIER '${envTier}', will auto-detect`, 'warn');
      }
    }

    // Max logs block range will be set after tier detection in initialize()
    this.maxLogsBlockRange = null;

    this.currentTime = now();
    this.db = null;
    this.rpc = null; // For backward compatibility
    this.logsClient = null; // Will point to alchemyClient
    this.alchemyClient = null; // Primary RPC client for all calls
    this.ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

    // Performance settings
    this.timeout = options.timeout || parseInt(process.env.TIMEOUT_SECONDS || '7200', 10);
    this.maxRetries = options.maxRetries || 3;
    this.batchSizes = {
      default: options.batchSize || 1000,
      rpc: options.rpcBatch || 300,
      etherscan: options.etherscanBatch || 100,
      ...options.batchSizes
    };
    
    this.log(`Initialized ${this.name} scanner for network: ${this.network}`);
  }

  async initialize() {
    this.log('🔄 Starting initialization...');
    
    this.log('🔗 Connecting to database...');
    this.db = await initializeDB();
    this.log('✅ Database connected');
    
    this.log('🔧 Ensuring schema...');
    await ensureSchema(this.db);
    this.log('✅ Schema ready');
    
    if (!this.config) {
      throw new Error(`Network "${this.network}" not found in config`);
    }
    
    this.log('🌐 Initializing RPC clients...');
    // Initialize Alchemy RPC client for all RPC calls
    const clients = createRpcClient(this.network);
    this.alchemyClient = clients.alchemyClient;
    this.logsClient = clients.alchemyClient; // Use Alchemy for getLogs too
    this.rpc = clients; // Keep for backward compatibility
    this.log('✅ RPC clients ready (Alchemy RPC for all calls including getLogs)');

    // Auto-detect Alchemy tier if not manually set
    if (this.tierAutoDetect) {
      this.log('🔍 Auto-detecting Alchemy tier...');
      this.alchemyTier = await this.alchemyClient.detectTier();
    }

    // Set max logs block range based on detected/configured tier
    if (this.config.maxLogsBlockRange && this.alchemyTier) {
      // Try to get tier-specific limit, fallback to premium if not found
      // (payg/growth/enterprise tiers use premium limits)
      this.maxLogsBlockRange = this.config.maxLogsBlockRange[this.alchemyTier] ||
                                this.config.maxLogsBlockRange['premium'] ||
                                10;

      // Normalize tier display name (growth/payg/enterprise -> premium)
      const displayTier = (this.alchemyTier === 'free') ? 'free' : 'premium';
      this.log(`Max getLogs block range: ${this.maxLogsBlockRange} blocks (${displayTier} tier)`);
    } else {
      // Fallback to conservative default
      this.maxLogsBlockRange = 10;
      this.log(`Using default max getLogs block range: ${this.maxLogsBlockRange} blocks`, 'warn');
    }

    // Apply tier-optimized logs configuration if network has logsOptimization profile
    if (this.config.logsOptimization && this.alchemyTier) {
      // Get activity profile name from network config
      const activityProfile = this.getActivityProfileName(this.config.logsOptimization);

      // Get tier-optimized configuration
      this.logsOptimization = getLogsOptimization(activityProfile, this.alchemyTier);

      // Normalize tier display name (growth/payg/enterprise -> premium)
      const displayTier = (this.alchemyTier === 'free') ? 'free' : 'premium';
      this.log(`📊 Using logs optimization profile: ${activityProfile}-${displayTier}`);
      this.log(`   Initial batch: ${this.logsOptimization.initialBatchSize}, ` +
               `Range: ${this.logsOptimization.minBatchSize}-${this.logsOptimization.maxBatchSize} blocks, ` +
               `Target logs: ${this.logsOptimization.targetLogsPerRequest}`);

      // Load learned statistics and apply dynamic tuning if available
      if (typeof this.loadLogDensityStats === 'function') {
        const learnedStats = await this.loadLogDensityStats();
        if (learnedStats) {
          this.applyLearnedOptimizations(learnedStats);
        }
      }
    } else if (this.config.logsOptimization) {
      // Use network-defined profile as fallback (legacy behavior)
      this.logsOptimization = this.config.logsOptimization;
      this.log(`📊 Using legacy logs optimization profile`, 'warn');
    }

    this.log('✅ Initialization completed successfully');
  }

  async cleanup() {
    if (this.db) {
      try {
        this.log('Releasing database client...');
        // First release the individual client back to the pool
        this.db.release();
        this.log('Database client released');
        
        this.log('Closing database pool...');
        await closeDB();
        this.db = null;
        this.log('Database connections closed');
      } catch (error) {
        this.log(`Database cleanup error: ${error.message}`, 'error');
      }
    }
    this.log('Cleanup completed');
  }

  /**
   * Extract activity profile name from logsOptimization config
   * @param {object} logsOptConfig - The logsOptimization config object or profile name
   * @returns {string} Activity profile name (e.g., 'high-activity', 'medium-activity', 'low-activity')
   */
  getActivityProfileName(logsOptConfig) {
    // If it's already a string profile name (legacy config), return as-is
    if (typeof logsOptConfig === 'string') {
      return logsOptConfig;
    }

    // If it's an object, try to match it against known profiles
    const { LOGS_OPTIMIZATION } = require('../config/networks.js');

    // Check which profile this config matches
    for (const [profileName, profileConfig] of Object.entries(LOGS_OPTIMIZATION)) {
      if (profileConfig === logsOptConfig) {
        // Strip tier suffix if present (e.g., 'high-activity-payg' -> 'high-activity')
        return profileName.replace(/-(?:free|payg|premium|growth)$/, '');
      }
    }

    // If no match found, default to medium-activity
    return 'medium-activity';
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}][${this.name}][${this.network}]`;
    console.log(`${prefix} ${message}`);
  }

  sleep(ms) {
    return sleep(ms);
  }

  // Batch processing with retry logic
  async processBatch(items, processor, options = {}) {
    const batchSize = options.batchSize || this.batchSizes.default;
    const concurrency = options.concurrency || 5;
    
    return batchOperation(items, processor, {
      batchSize,
      concurrency,
      retries: this.maxRetries,
      delayMs: options.delayMs || 100
    });
  }

  // Contract operations
  async isContracts(addresses) {
    return contractCall.isContracts(this.network, addresses);
  }

  async getCodeHashes(addresses) {
    return contractCall.getCodeHashes(this.network, addresses);
  }

  async getNativeBalances(addresses) {
    return contractCall.fetchNativeBalances(this.network, addresses);
  }

  async getERC20Balances(holders, tokens) {
    return contractCall.fetchErc20Balances(this.network, holders, tokens);
  }

  // RPC operations
  async rpcCall(method, params = []) {
    // Use alchemyClient for general RPC calls
    return this.alchemyClient.makeRequest(method, params);
  }

  async getBlockNumber() {
    // Use Alchemy RPC directly for most reliable and fastest results
    return this.alchemyClient.getBlockNumber();
  }

  async getBlockByNumber(blockNumber) {
    // Use Alchemy RPC for block data as it's more reliable for this operation
    return this.alchemyClient.getBlock(blockNumber);
  }

  async getLogs(filter) {
    const fromBlock = filter.fromBlock || 'latest';
    const toBlock = filter.toBlock || 'latest';
    const description = `getLogs(${fromBlock}-${toBlock})`;

    // Use Alchemy RPC for getLogs (more reliable and consistent)
    // console.log(`[${this.network}] getLogs via Alchemy RPC: ${description}`);
    return this.alchemyClient.getLogs(filter);
  }

  // Etherscan operations  
  async etherscanCall(params) {
    return etherscanRequest(this.network, params);
  }

  // Database operations
  async queryDB(query, params = []) {
    return this.db.query(query, params);
  }

  /**
   * Find block number closest to target timestamp using binary search
   * @param {number} targetTimestamp - Target timestamp (Unix timestamp)
   * @param {number} tolerance - Acceptable time difference in seconds (default: 300 = 5 minutes)
   * @returns {Promise<number>} Block number closest to target timestamp
   */
  /**
   * Get block number by timestamp using Etherscan API
   * @param {number} targetTimestamp - Unix timestamp in seconds
   * @returns {Promise<number>} Block number at or before target timestamp
   */
  async getBlockNumberByTime(targetTimestamp) {
    try {
      // Use Etherscan API to get block number by timestamp
      const result = await this.etherscanCall({
        module: 'block',
        action: 'getblocknobytime',
        timestamp: targetTimestamp,
        closest: 'before'  // Get block before or at timestamp
      });
      
      const blockNumber = parseInt(result);
      
      // Simple validation - ensure reasonable block number
      if (blockNumber <= 0 ) {
        this.log(`Invalid block number ${blockNumber} from API, using current block`, 'warn');
        return await this.getBlockNumber(); // Return current block as fallback
      }
      
      return blockNumber;
    } catch (error) {
      this.log(`Failed to get block by timestamp via API: ${error.message}`, 'warn');
      // Fallback to current block
      return await this.getBlockNumber();
    }
  }


  /**
   * Get block by time - wrapper for backward compatibility
   * Uses getBlockNumberByTime for improved accuracy
   * @param {number} targetTimestamp - Unix timestamp in seconds
   * @returns {Promise<number>} Block number at target timestamp
   */
  async getBlockByTime(targetTimestamp) {
    return this.getBlockNumberByTime(targetTimestamp);
  }

  // Main execution wrapper
  async execute() {
    const startTime = Date.now();
    let hasError = false;
    
    try {
      await this.initialize();
      await this.run(); // Must be implemented by subclasses
      
      const duration = (Date.now() - startTime) / 1000;
      this.log(`Completed successfully in ${duration.toFixed(2)}s`);
    } catch (error) {
      hasError = true;
      const duration = (Date.now() - startTime) / 1000;
      this.log(`Failed after ${duration.toFixed(2)}s: ${error.message}`, 'error');
      
      // Don't re-throw the error to allow graceful shutdown
      // Just log it and continue to cleanup
    } finally {
      try {
        await this.cleanup();
      } catch (cleanupError) {
        this.log(`Cleanup error: ${cleanupError.message}`, 'error');
      }
    }
    
    // Force exit after a short delay to allow logs to flush
    if (hasError) {
      setTimeout(() => {
        this.log('Forcing process exit due to error');
        process.exit(1);
      }, 100);
    } else {
      // For successful completion when run directly
      if (require.main === module || process.env.AUTO_EXIT === 'true') {
        setTimeout(() => {
          this.log('Forcing process exit after successful completion');
          process.exit(0);
        }, 100);
      }
    }
  }

  // ====== PERFORMANCE OPTIMIZATION HELPERS ======
  
  /**
   * Optimized query execution with performance monitoring
   * @param {string} query - SQL query with parameters
   * @param {Array} params - Query parameters  
   * @param {Object} options - Query options
   */
  async queryDBOptimized(query, params = [], options = {}) {
    const { logSlow = true, slowThreshold = 1000 } = options;
    const start = Date.now();
    
    try {
      const result = await this.queryDB(query, params);
      const duration = Date.now() - start;
      
      if (logSlow && duration > slowThreshold) {
        this.log(`⚠️  Slow query detected: ${duration}ms - ${query.substring(0, 50)}...`);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.log(`❌ Query failed after ${duration}ms: ${error.message}`, 'error');
      throw error;
    }
  }
  
  /**
   * Execute query with prepared statement patterns for better performance
   * @param {string} queryName - Identifier for query caching
   * @param {string} query - SQL query
   * @param {Array} params - Parameters
   */
  async queryWithCache(queryName, query, params = []) {
    // Simple query identifier for performance monitoring
    const cacheKey = `${this.constructor.name}_${queryName}`;
    const start = Date.now();
    
    try {
      const result = await this.queryDB(query, params);
      const duration = Date.now() - start;
      
      // Log performance for analysis
      if (duration > 100) {
        this.log(`📊 ${cacheKey}: ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      this.log(`❌ Cached query ${cacheKey} failed: ${error.message}`, 'error');
      throw error;
    }
  }

  // Abstract method - must be implemented by subclasses
  async run() {
    throw new Error(`run() method must be implemented by ${this.constructor.name}`);
  }
}

module.exports = Scanner;
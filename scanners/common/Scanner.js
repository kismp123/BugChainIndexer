/* eslint-disable no-console */
/**
 * Unified Scanner Base Class
 * Consolidates all common scanner functionality
 */
const { NETWORKS, CONFIG } = require('../config/networks.js');
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
    this.currentTime = now();
    this.db = null;
    this.rpc = null; // HTTP RPC client
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
    
    this.log('🌐 Initializing RPC client...');
    // Initialize HTTP RPC client
    this.rpc = createRpcClient(this.network);
    this.log('✅ RPC client ready');
    
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

  // RPC operations
  async rpcCall(method, params = []) {
    return this.rpc.send(method, params);
  }

  async getBlockNumber() {
    try {
      // Use stable Etherscan API endpoint for block number
      const result = await this.etherscanCall({
        module: 'block',
        action: 'getblocknobytime',
        timestamp: Math.floor(Date.now() / 1000),
        closest: 'before'
      });
      return parseInt(result);
    } catch (error) {
      this.log(`Failed to get current block via API, using RPC: ${error.message}`, 'warn');
      // Fallback to RPC
      return this.rpc.getBlockNumber();
    }
  }

  async getBlockByNumber(blockNumber) {
    // Use RPC for block data as it's more reliable for this operation
    return this.rpc.getBlockByNumber(blockNumber);
  }

  async getLogs(filter) {
    const { globalAPILimiter } = require('./core.js');
    
    // Create request description
    const fromBlock = filter.fromBlock || 'latest';
    const toBlock = filter.toBlock || 'latest';
    const description = `getLogs(${fromBlock}-${toBlock})`;
    
    // Use RPC limiter for getLogs calls
    return globalAPILimiter.queueRPCRequest(
      () => this.rpc.getLogs(filter),
      this.network,
      description
    );
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
/* eslint-disable no-console */
/**
 * Core Scanner Functionality
 * Unified RPC, Contract Calls, and Essential Utils
 */
const { ethers } = require('ethers');
const axios = require('axios');
const { Pool } = require('pg');
const { NETWORKS, CONFIG } = require('../config/networks.js');
const { cleanAddressParams } = require('./addressUtils');
const { AlchemyRPCClient } = require('./alchemyRpc');
// ====== CONSTANTS (MERGED FROM HELPERS.JS) ======
const BATCH_SIZES = {
  LOGS_MIN: 1,
  LOGS_DEFAULT: 50,
  LOGS_MAX: 1000,
  ADDRESSES_DEFAULT: 100,
  CONTRACTS_DEFAULT: 50,
  VERIFICATION_BATCH: 5,
  ETHERSCAN_BATCH: 5,
};

const TIMEOUTS = {
  RPC_CALL: 5000,
  BLOCK_QUERY: 15000,
  BLOCK_QUERY_FAST: 3000,
  GET_LOGS: 20000,  // Reduced from 60s to 20s for faster failure detection
  TRANSACTION_QUERY: 5000,
  CONTRACT_CREATION: 10000,
};

const RETRY_CONFIG = {
  MAX_ATTEMPTS: 5,
  PROGRESSIVE_DELAY_BASE: 1000,
  ETHERSCAN_MAX_RETRIES: 5,
  RPC_MAX_RETRIES: 3,
  EXPONENTIAL_BACKOFF: true,
  MAX_BACKOFF: 30000,
};

const PERFORMANCE = {
  TARGET_DURATION: 8000,
  FAST_RESPONSE: 3000,
  SLOW_RESPONSE: 15000,
  VERY_SLOW_RESPONSE: 30000,
  FAST_MULTIPLIER: 3.0,
  GOOD_MULTIPLIER: 2.0,
  SLOW_MULTIPLIER: 0.8,
  VERY_SLOW_MULTIPLIER: 0.5,
};

const PROCESSING = {
  MAX_CONCURRENT_PROCESSING: 3,
  NETWORK_BASE_DELAY: 1000,
  RANDOM_DELAY_MAX: 2000,
  BATCH_DELAY: 200,
  VERIFICATION_DELAY: 4000,
  EOA_DETECTION_DELAY: 4000,
};

const NETWORK_LIST = [
  'ethereum', 'binance', 'optimism', 'base', 'arbitrum', 'polygon',
  'avalanche', 'gnosis', 'linea', 'scroll', 'mantle', 'opbnb',
  'polygon-zkevm', 'arbitrum-nova', 'celo', 'cronos', 'moonbeam', 'moonriver'
];

const BLOCKCHAIN_CONSTANTS = {
  TRANSFER_EVENT: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  ZERO_HASH: '0x0000000000000000000000000000000000000000000000000000000000000000',
};

const API_LIMITS = {
  ETHERSCAN: {
    MAX_CONCURRENT: 3,
    MIN_DELAY: 1500,
    MAX_DELAY: 3000,
    BURST_LIMIT: 10,
    BURST_WINDOW: 60000,
    ADAPTIVE_DELAY: true,
  },
  RPC: {
    MAX_CONCURRENT: 8,
    MIN_DELAY: 300,
    MAX_DELAY: 1000,
    BURST_LIMIT: 20,
    BURST_WINDOW: 30000,
    ADAPTIVE_DELAY: true,
  },
};

// Legacy constants for compatibility
const ZERO_HASH = BLOCKCHAIN_CONSTANTS.ZERO_HASH;

// ====== DATABASE ======
let dbPool;

async function ensureDatabaseExists() {
  const dbName = process.env.PGDATABASE || 'bugchain_indexer';
  const adminPool = new Pool({
    user: process.env.PGUSER || 'postgres',
    host: process.env.PGHOST || 'localhost',
    database: 'postgres', // Connect to default postgres database
    password: process.env.PGPASSWORD || '',
    port: Number(process.env.PGPORT || 5432),
    max: 1,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await adminPool.connect();
    
    // Check if database exists
    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );
    
    if (result.rows.length === 0) {
      console.log(`[DB] Database "${dbName}" does not exist. Creating...`);
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`[DB] Database "${dbName}" created successfully`);
    } else {
      console.log(`[DB] Database "${dbName}" already exists`);
    }
    
    client.release();
  } catch (error) {
    console.log(`[DB] Database creation check failed: ${error.message}`);
    // Continue anyway - the database might exist or we might not have permissions
  } finally {
    await adminPool.end();
  }
}

async function initializeDB() {
  // First ensure the database exists
  await ensureDatabaseExists();
  
  if (!dbPool) {
    dbPool = new Pool({
      user: process.env.PGUSER || 'postgres',
      host: process.env.PGHOST || 'localhost',
      database: process.env.PGDATABASE || 'bugchain_indexer',
      password: process.env.PGPASSWORD || '',
      port: Number(process.env.PGPORT || 5432),
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return dbPool.connect();
}

async function closeDB() {
  if (dbPool) {
    try {
      console.log('[DEBUG] Closing database pool...');
      console.log(`[DEBUG] Pool stats: total=${dbPool.totalCount}, idle=${dbPool.idleCount}, waiting=${dbPool.waitingCount}`);
      
      await dbPool.end();
      console.log('[DEBUG] Database pool closed gracefully');
      dbPool = null;
    } catch (error) {
      console.error('[DEBUG] Error closing database pool:', error.message);
      dbPool = null;
    }
  }
}

// ====== BASIC UTILS ======
const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeAddress(address) {
  if (!address || typeof address !== 'string') return address;
  return address.toLowerCase();
}

function normalizeAddressArray(addresses) {
  if (!Array.isArray(addresses)) return addresses;
  return addresses.map(addr => normalizeAddress(addr));
}

// ====== API LIMITER ======
class APILimiter {
  constructor() {
    this.etherscanQueue = [];
    this.rpcQueue = [];
    this.processing = false;
    this.activeRequests = { etherscan: 0, rpc: 0 };
    
    this.limits = {
      etherscan: {
        maxConcurrent: API_LIMITS.ETHERSCAN.MAX_CONCURRENT,
        minDelay: API_LIMITS.ETHERSCAN.MIN_DELAY,
        maxDelay: API_LIMITS.ETHERSCAN.MAX_DELAY
      },
      rpc: {
        maxConcurrent: API_LIMITS.RPC.MAX_CONCURRENT,
        minDelay: API_LIMITS.RPC.MIN_DELAY,
        maxDelay: API_LIMITS.RPC.MAX_DELAY
      }
    };
    
    this.stats = {
      etherscan: { totalRequests: 0, successfulRequests: 0, failedRequests: 0, averageWaitTime: 0 },
      rpc: { totalRequests: 0, successfulRequests: 0, failedRequests: 0, averageWaitTime: 0 }
    };
  }

  async queueEtherscanRequest(requestFunction, network = 'unknown', description = 'Etherscan call') {
    return this.queueRequest('etherscan', requestFunction, network, description);
  }

  async queueRPCRequest(requestFunction, network = 'unknown', description = 'RPC call') {
    return this.queueRequest('rpc', requestFunction, network, description);
  }

  async queueRequest(type, requestFunction, network = 'unknown', description = 'API call') {
    return new Promise((resolve, reject) => {
      const requestItem = {
        id: `${type}-${network}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type, network, description, requestFunction, resolve, reject,
        queuedAt: Date.now()
      };
      
      if (type === 'etherscan') {
        this.etherscanQueue.push(requestItem);
        this.stats.etherscan.totalRequests++;
      } else if (type === 'rpc') {
        this.rpcQueue.push(requestItem);
        this.stats.rpc.totalRequests++;
      }
      
      if (!this.processing) {
        this.processQueues();
      }
    });
  }

  async processQueues() {
    if (this.processing) return;
    
    this.processing = true;
    
    const processPromises = [
      this.processQueueType('etherscan'),
      this.processQueueType('rpc')
    ];
    
    await Promise.all(processPromises);
    this.processing = false;
  }

  async processQueueType(type) {
    const queue = type === 'etherscan' ? this.etherscanQueue : this.rpcQueue;
    const limits = this.limits[type];
    
    while (queue.length > 0) {
      while (this.activeRequests[type] >= limits.maxConcurrent) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      const request = queue.shift();
      if (!request) break;
      
      this.executeRequest(request);
      
      const delay = limits.minDelay + Math.random() * (limits.maxDelay - limits.minDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  async executeRequest(request) {
    const startTime = Date.now();
    this.activeRequests[request.type]++;
    
    try {
      const result = await request.requestFunction();
      const duration = Date.now() - startTime;
      
      this.stats[request.type].successfulRequests++;
      this.updateAverageWaitTime(request.type, duration);
      
      request.resolve(result);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats[request.type].failedRequests++;
      
      request.reject(error);
      
    } finally {
      this.activeRequests[request.type]--;
    }
  }

  updateAverageWaitTime(type, duration) {
    const alpha = 0.1;
    this.stats[type].averageWaitTime = (1 - alpha) * this.stats[type].averageWaitTime + alpha * duration;
  }
}

const globalAPILimiter = new APILimiter();

// ====== ETHERSCAN ======
const etherscanState = new Map();

function initEtherscan(network, apiKeys) {
  const keys = Array.isArray(apiKeys) ? apiKeys : apiKeys.split(/[,\s]+/).filter(Boolean);
  etherscanState.set(network, { keys, index: 0 });
}

async function etherscanRequestInternal(network, params, maxRetries = 3) {
  // Clean and normalize address parameters before sending
  const cleanedParams = cleanAddressParams(params);
  
  // Check if proxy server is enabled
  const useProxy = process.env.USE_ETHERSCAN_PROXY === 'true';
  const proxyUrl = process.env.ETHERSCAN_PROXY_URL || 'http://localhost:3000';
  
  if (useProxy) {
    // Use proxy server for Etherscan API calls
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Prepare params - flatten all parameters
        const requestBody = {
          module: cleanedParams.module,
          action: cleanedParams.action,
          ...cleanedParams
        };
        // Remove apikey as proxy manages it
        delete requestBody.apikey;
        
        const response = await axios.post(`${proxyUrl}/api/etherscan/${network}`, requestBody, {
          timeout: 30000,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (response.data?.success) {
          // Handle proxy module special case - it might return result directly
          if (cleanedParams.module === 'proxy' && response.data.data?.jsonrpc) {
            return response.data.data.result;
          }
          return response.data.data;
        }
        
        throw new Error(response.data?.error || 'Proxy request failed');
      } catch (error) {
        const isRetryable = error.response?.status === 429 || // Rate limited
                          error.response?.status >= 500 || // Server error
                          error.code === 'ECONNREFUSED' ||  // Connection refused
                          error.code === 'ETIMEDOUT';        // Timeout
        
        if (attempt < maxRetries && isRetryable) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff
          console.log(`[${network}] Proxy retry ${attempt}/${maxRetries} after ${delay}ms: ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // Final attempt failed or non-retryable error
        console.error(`[${network}] Proxy failed for ${cleanedParams.module}.${cleanedParams.action}:`, error.message);
        
        // If proxy is down, fall back to direct API calls
        if (error.code === 'ECONNREFUSED') {
          console.warn(`[${network}] Proxy server not available, falling back to direct API calls`);
          break; // Exit loop and use direct API
        }
        
        throw error; // Throw for other errors
      }
    }
  }
  
  // Original direct Etherscan API logic
  const config = NETWORKS[network];
  if (!config) throw new Error(`Unknown network: ${network}`);
  
  if (!etherscanState.has(network) && config.apiKeys) {
    initEtherscan(network, config.apiKeys);
  }
  
  const state = etherscanState.get(network) || { keys: [], index: 0 };
  
  if (state.keys.length === 0) {
    throw new Error(`No Etherscan API keys configured for network: ${network}`);
  }

  const baseURL = 'https://api.etherscan.io/v2/api';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const apikey = state.keys[state.index % state.keys.length];
      const response = await axios.get(baseURL, {
        params: { ...cleanedParams, chainid: config.chainId, apikey },
        timeout: 20000
      });

      // Handle proxy module differently (no status field)
      if (cleanedParams.module === 'proxy') {
        // Proxy responses have jsonrpc format without status field
        if (response.data?.result !== undefined) {
          return response.data.result;
        }
        // If proxy call has an error, it will be in response.data.error
        if (response.data?.error) {
          throw new Error(`Proxy error: ${response.data.error.message || 'Unknown proxy error'}`);
        }
        // No result and no error - return null
        return null;
      }
      
      // Handle successful response for non-proxy modules
      if (response.data?.status === '1') {
        return response.data.result;
      }
      
      // Handle NOTOK responses
      const message = response.data?.message || 'Etherscan API error';
      
      // Check if this is a "no data" response (not an error, just no data available)
      const isNoDataResponse = message.includes('No data found') ||
                               message.includes('No transactions found') ||
                               message.includes('No records found');
      
      if (isNoDataResponse) {
        // Return empty array for "no data" - this is not an error
        return [];
      }
      
      // Check if this is a retryable error
      const isRetryableError = message.includes('Max rate limit reached') || 
                              message.includes('rate limit') ||
                              message.includes('NOTOK');
      
      if (isRetryableError && attempt < maxRetries) {
        const oldKeyIndex = state.index;
        state.index = (state.index + 1) % state.keys.length;
        
        let baseWaitTime = message.includes('rate limit') ? 10000 : 12000;
        const baseDelay = baseWaitTime * attempt;
        const jitter = Math.random() * 3000;
        const waitTime = baseDelay + jitter;
        
        console.log(`[${network}] Waiting ${(waitTime/1000).toFixed(1)}s before retry ${attempt}/${maxRetries}`);
        await sleep(waitTime);
        
        continue;
      }
      
      throw new Error(message);
    } catch (error) {
      if (attempt < maxRetries) {
        state.index = (state.index + 1) % state.keys.length;
        await sleep(1000 * attempt);
        continue;
      }
      throw error;
    }
  }
}

async function etherscanRequest(network, params, maxRetries = 3) {
  const description = `${params.module}/${params.action}`;
  
  return globalAPILimiter.queueEtherscanRequest(
    () => etherscanRequestInternal(network, params, maxRetries),
    network,
    description
  );
}

// ====== HTTP RPC CLIENT ======
const rpcRotation = new Map();
const failedRpcs = new Map();
const permanentlyFailedRpcs = new Map(); // Track permanently failed RPCs (403, sanctioned, etc)
const temporarilyFailedRpcs = new Map(); // Track temporarily failed RPCs (can be retried)
const slowRpcs = new Map(); // Track temporarily slow RPCs

class HttpRpcClient {
  constructor(network) {
    this.network = network;
    this.config = NETWORKS[network];
    this.requestId = 0;
    
    if (!this.config?.rpcUrls?.length) {
      throw new Error(`No RPC URLs configured for network: ${network}`);
    }
    
    // Log primary RPC on initialization (commented for production)
    // const primaryRpc = this.config.rpcUrls[0];
    // const isAlchemy = primaryRpc.includes('alchemy.com');
    // console.log(`[${this.network}] 📡 RPC Client initialized with ${this.config.rpcUrls.length} endpoints`);
    // console.log(`[${this.network}] 🥇 Primary RPC: ${primaryRpc.split('/')[2]}${isAlchemy ? ' (Alchemy)' : ''}`);
  }

  markRpcAsFailed(rpcUrl) {
    if (!failedRpcs.has(this.network)) {
      failedRpcs.set(this.network, new Set());
    }
    failedRpcs.get(this.network).add(rpcUrl);
  }
  
  markRpcAsPermanentlyFailed(rpcUrl) {
    if (!permanentlyFailedRpcs.has(this.network)) {
      permanentlyFailedRpcs.set(this.network, new Set());
    }
    permanentlyFailedRpcs.get(this.network).add(rpcUrl);
    // Also add to regular failed list
    this.markRpcAsFailed(rpcUrl);
  }
  
  markRpcAsTemporarilyFailed(rpcUrl) {
    if (!temporarilyFailedRpcs.has(this.network)) {
      temporarilyFailedRpcs.set(this.network, new Set());
    }
    temporarilyFailedRpcs.get(this.network).add(rpcUrl);
    // Set expiry time (5 minutes)
    setTimeout(() => {
      const tempFailed = temporarilyFailedRpcs.get(this.network);
      if (tempFailed) {
        tempFailed.delete(rpcUrl);
      }
    }, 5 * 60 * 1000);
  }
  
  markRpcAsSlow(rpcUrl) {
    if (!slowRpcs.has(this.network)) {
      slowRpcs.set(this.network, new Map());
    }
    // Mark as slow for 5 minutes
    slowRpcs.get(this.network).set(rpcUrl, Date.now() + 5 * 60 * 1000);
  }
  
  isRpcSlow(rpcUrl) {
    const slowMap = slowRpcs.get(this.network);
    if (!slowMap) return false;
    
    const slowUntil = slowMap.get(rpcUrl);
    if (!slowUntil) return false;
    
    if (Date.now() > slowUntil) {
      slowMap.delete(rpcUrl);
      return false;
    }
    return true;
  }

  async makeRequest(method, params = [], maxGlobalRetries = 3) {
    const description = `${method}(${params.length > 0 ? '...' : ''})`;
    
    return globalAPILimiter.queueRPCRequest(
      () => this.makeRequestInternal(method, params, maxGlobalRetries),
      this.network,
      description
    );
  }

  async makeRequestInternal(method, params = [], maxGlobalRetries = 3) {
    let globalRetryCount = 0;
    let lastError;
    
    while (globalRetryCount < maxGlobalRetries) {
      const failedSet = failedRpcs.get(this.network) || new Set();
      const permanentFailedSet = permanentlyFailedRpcs.get(this.network) || new Set();
      const tempFailedSet = temporarilyFailedRpcs.get(this.network) || new Set();
      
      // Filter out permanently failed RPCs first, then temporarily failed ones
      let availableRpcs = this.config.rpcUrls.filter(url => 
        !permanentFailedSet.has(url) && !failedSet.has(url) && !tempFailedSet.has(url)
      );
      
      if (availableRpcs.length === 0) {
        // If all RPCs failed, only reset non-permanent failures
        failedRpcs.delete(this.network);
        temporarilyFailedRpcs.delete(this.network);
        // Try again with RPCs that aren't permanently failed
        availableRpcs = this.config.rpcUrls.filter(url => !permanentFailedSet.has(url));
        
        if (availableRpcs.length === 0) {
          // If even all non-permanent RPCs are exhausted, reset everything as last resort
          console.log(`[${this.network}] WARNING: All RPCs permanently failed, resetting for emergency retry`);
          permanentlyFailedRpcs.delete(this.network);
          availableRpcs = [...this.config.rpcUrls];
        }
      }
      
      // Separate slow and non-slow RPCs, excluding Alchemy
      const slowRpcList = [];
      const fastRpcList = [];
      
      for (const rpc of availableRpcs) {
        // Skip Alchemy URLs as they're handled separately
        if (rpc.includes('alchemy.com') || rpc.includes(':3001/rpc/')) {
          continue;
        } else if (this.isRpcSlow(rpc)) {
          slowRpcList.push(rpc);
        } else {
          fastRpcList.push(rpc);
        }
      }
      
      // Shuffle non-Alchemy fast RPCs for load balancing
      for (let i = fastRpcList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [fastRpcList[i], fastRpcList[j]] = [fastRpcList[j], fastRpcList[i]];
      }
      
      // Shuffle slow RPCs
      for (let i = slowRpcList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [slowRpcList[i], slowRpcList[j]] = [slowRpcList[j], slowRpcList[i]];
      }
      
      // Use non-Alchemy RPCs only (Alchemy handled separately)
      availableRpcs = [...fastRpcList, ...slowRpcList];
      
      if (availableRpcs.length === 0) {
        throw new Error(`No non-Alchemy RPC endpoints available for ${this.network}`);
      }
      
      for (let i = 0; i < availableRpcs.length; i++) {
        const rpcUrl = availableRpcs[i];
        
        // Log RPC selection and switching (only for debugging)
        // Comment out in production to reduce log noise
        /*
        if (i === 0 && globalRetryCount === 0) {
          const isAlchemy = rpcUrl.includes('alchemy.com') || rpcUrl.includes(':3001/rpc/');
          const isProxy = rpcUrl.includes(':3001/rpc/');
          const rpcHost = rpcUrl.split('/')[2];
          console.log(`[${this.network}] 🎯 Selected RPC: ${rpcHost}${isAlchemy ? (isProxy ? ' (Alchemy Proxy)' : ' (Alchemy)') : ''}`);
        } else if (i > 0) {
          console.log(`[${this.network}] 🔄 Switching to RPC #${i + 1}/${availableRpcs.length}: ${rpcUrl.split('/')[2]}`);
        } else if (globalRetryCount > 0) {
          console.log(`[${this.network}] 🔄 Retrying with RPC: ${rpcUrl.split('/')[2]}`);
        }
        */
        
        this.requestId++;
        
        const payload = {
          jsonrpc: '2.0',
          method,
          params,
          id: this.requestId
        };

        try {
          // Create promise with timeout
          const axiosPromise = axios.post(rpcUrl, payload, {
            timeout: 25000,  // 25 seconds for axios
            headers: { 'Content-Type': 'application/json' },
            validateStatus: (status) => status < 500,
            // Additional settings to prevent hanging
            maxContentLength: 50 * 1024 * 1024,  // 50MB max
            maxBodyLength: 50 * 1024 * 1024,
            decompress: true,
            responseType: 'json'
          });
          
          // Wrap with race to enforce timeout
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`RPC timeout after 30s: ${rpcUrl}`)), 30000);
          });
          
          const response = await Promise.race([axiosPromise, timeoutPromise]);
          
          // Special handling for Alchemy proxy response format
          if (rpcUrl.includes(':3001/rpc/')) {
            // Alchemy proxy returns the result directly in the expected format
            // No special handling needed as proxy returns standard JSON-RPC format
          }

          if (response.data.error) {
            throw new Error(`RPC Error: ${response.data.error.message} (code: ${response.data.error.code})`);
          }

          if (!response.data.result && response.data.result !== null) {
            throw new Error('Invalid RPC response: missing result');
          }

          const currentIndex = this.config.rpcUrls.indexOf(rpcUrl);
          rpcRotation.set(this.network, (currentIndex + 1) % this.config.rpcUrls.length);
          
          return response.data.result;
        } catch (error) {
          lastError = error;
          
          // Check for timeout errors
          const isTimeoutError = error.code === 'ECONNABORTED' ||
                                error.message?.includes('timeout') ||
                                error.message?.includes('ETIMEDOUT') ||
                                error.message?.includes('request timeout') ||
                                error.message?.includes('fetch timeout');
          
          if (isTimeoutError) {
            console.log(`[${this.network}] RPC timeout detected for ${rpcUrl} - marking as slow and switching to next RPC`);
            this.markRpcAsSlow(rpcUrl);
            // Don't mark as permanently failed for timeouts, just move to next RPC
          }
          
          // Gas errors should be temporary, not permanent
          const isGasError = error.message?.includes('out of gas') ||
                             error.message?.includes('gas exhausted') ||
                             error.message?.includes('gas required exceeds');
          
          const isPermanentError = !isGasError && (
                                 error.response?.status === 401 || 
                                 error.response?.status === 403 ||
                                 error.message?.includes('Unauthorized') ||
                                 error.message?.includes('method not found') ||
                                 error.message?.includes('Must be authenticated') ||
                                 error.message?.includes('API key disabled') ||
                                 error.message?.includes('sanctioned')); // LlamaRPC sanctioned addresses

          if (isPermanentError) {
            console.log(`[${this.network}] ❌ RPC endpoint permanently failed: ${rpcUrl} - ${error.message}`);
            this.markRpcAsPermanentlyFailed(rpcUrl);
            console.log(`[${this.network}] ⚠️  This RPC will be excluded from future attempts in this session`);
          } else {
            // For temporary errors, mark as temporarily failed
            this.markRpcAsTemporarilyFailed(rpcUrl);
          }
          
          // Log the error with RPC URL for better debugging
          const errorType = isTimeoutError ? 'TIMEOUT' : (isPermanentError ? 'PERMANENT' : 'TEMPORARY');
          console.log(`[${this.network}][${errorType}] RPC error on ${rpcUrl.split('/')[2]}: ${error.message?.slice(0, 100)}`);
          
          if (i < availableRpcs.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      }

      globalRetryCount++;
      
      const isRateLimitError = lastError?.message?.includes('Too many requests') || 
                             lastError?.message?.includes('rate limit') ||
                             lastError?.message?.includes('429');
      
      if (globalRetryCount < maxGlobalRetries && isRateLimitError) {
        const waitTime = Math.min(5000 * Math.pow(2, globalRetryCount - 1), 30000);
        console.log(`[${this.network}] Rate limit hit, waiting ${waitTime/1000}s before retry ${globalRetryCount}/${maxGlobalRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // Only clear non-permanent failures
        failedRpcs.delete(this.network);
        temporarilyFailedRpcs.delete(this.network);
        // Do NOT clear permanentlyFailedRpcs here
      } else if (globalRetryCount < maxGlobalRetries) {
        const waitTime = 2000 * globalRetryCount;
        console.log(`[${this.network}] All RPCs failed, waiting ${waitTime/1000}s before retry ${globalRetryCount}/${maxGlobalRetries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    const totalAttempts = this.config.rpcUrls.length * maxGlobalRetries;
    throw new Error(`All ${totalAttempts} RPC attempts failed for ${this.network} after ${maxGlobalRetries} global retries. Last error: ${lastError.message}`);
  }

  async getBlockNumber() {
    const result = await this.makeRequest('eth_blockNumber');
    return parseInt(result, 16);
  }

  async getBlockByNumber(blockNumber, includeTxs = false) {
    const blockHex = typeof blockNumber === 'string' ? blockNumber : `0x${blockNumber.toString(16)}`;
    return this.makeRequest('eth_getBlockByNumber', [blockHex, includeTxs]);
  }

  async getLogs(filter) {
    // Debug logging (commented for production)
    // console.log(`[${this.network}] 📡 Calling eth_getLogs with filter:`, JSON.stringify(filter).substring(0, 200));
    const result = await this.makeRequest('eth_getLogs', [filter]);
    // console.log(`[${this.network}] ✅ eth_getLogs returned ${result.length} logs`);
    return result;
  }

  async getCode(address) {
    return this.makeRequest('eth_getCode', [address, 'latest']);
  }

  async getBalance(address) {
    const result = await this.makeRequest('eth_getBalance', [address, 'latest']);
    return result;
  }

  async call(transaction) {
    return this.makeRequest('eth_call', [transaction, 'latest']);
  }

  async send(method, params) {
    return this.makeRequest(method, params);
  }
}

function createRpcClient(network) {
  // Return both RPC clients separately
  // HttpRpcClient for getLogs, AlchemyRPCClient for everything else
  return {
    logsClient: new HttpRpcClient(network),    // For getLogs only
    alchemyClient: new AlchemyRPCClient(network)  // For all other calls
  };
}

// Backward compatibility wrapper
function createLogsRpcClient(network) {
  return new HttpRpcClient(network);
}

function createAlchemyRpcClient(network) {
  return new AlchemyRPCClient(network);
}

// ====== CONTRACT CALLS ======
const CONTRACT_VALIDATOR_ABI = [
  'function getCodeHashes(address[] memory addrs) external view returns(bytes32[] memory)',
  'function isContract(address[] memory addrs) external view returns(bool[] memory)'
];

const BALANCE_HELPER_ABI = [
  'function getNativeBalance(address[] memory addrs) external view returns(uint256[] memory)',
  'function getTokenBalance(address addr, address[] memory tokens) external view returns(uint256[] memory, uint256[] memory)'
];

const ERC20_ABI = ['function balanceOf(address) external view returns(uint256)'];

class ContractCall {
  constructor() {
    this.validatorCache = new Map();
    this.balanceCache = new Map();
    this.rpcClients = new Map();
  }

  getRpcClient(network) {
    if (!this.rpcClients.has(network)) {
      // Store both clients
      const clients = createRpcClient(network);
      this.rpcClients.set(network, clients);
    }
    return this.rpcClients.get(network);
  }
  
  getAlchemyClient(network) {
    const clients = this.getRpcClient(network);
    return clients.alchemyClient;
  }
  
  getLogsClient(network) {
    const clients = this.getRpcClient(network);
    return clients.logsClient;
  }

  getValidatorContract(network) {
    if (!this.validatorCache.has(network)) {
      const config = NETWORKS[network];
      const validatorAddress = config?.contractValidator;

      if (!validatorAddress) {
        console.warn(`No validator contract configured for network: ${network}`);
        return null;
      }

      this.validatorCache.set(network, {
        address: validatorAddress,
        abi: CONTRACT_VALIDATOR_ABI
      });
    }
    return this.validatorCache.get(network);
  }

  getBalanceContract(network) {
    if (!this.balanceCache.has(network)) {
      const config = NETWORKS[network];
      const balanceAddress = config?.BalanceHelper;

      if (!balanceAddress) {
        console.warn(`No balance helper contract configured for network: ${network}`);
        return null;
      }

      this.balanceCache.set(network, {
        address: balanceAddress,
        abi: BALANCE_HELPER_ABI
      });
    }
    return this.balanceCache.get(network);
  }

  async chunkOperation(addresses, operation, initialChunkSize = 50) {
    const results = [];
    const minChunkSize = 10;
    const maxChunkSize = 500;  // Increased maximum chunk size
    let currentChunkSize = initialChunkSize;
    
    for (let i = 0; i < addresses.length; i += currentChunkSize) {
      const chunk = addresses.slice(i, i + currentChunkSize);
      const startTime = Date.now();
      
      try {
        const chunkResult = await operation(chunk);
        const duration = Date.now() - startTime;
        
        results.push(...chunkResult);
        
        currentChunkSize = this.adjustChunkSize(currentChunkSize, duration, minChunkSize, maxChunkSize);
        
      } catch (error) {
        const newChunkSize = Math.max(minChunkSize, Math.floor(currentChunkSize * 0.5));
        
        if (newChunkSize < chunk.length) {
          for (let j = 0; j < chunk.length; j += newChunkSize) {
            const smallerChunk = chunk.slice(j, j + newChunkSize);
            try {
              const smallerResult = await operation(smallerChunk);
              results.push(...smallerResult);
            } catch (smallerError) {
              for (const addr of smallerChunk) {
                try {
                  const result = await operation([addr]);
                  results.push(...result);
                } catch (e) {
                  results.push(false);
                }
              }
            }
          }
          currentChunkSize = newChunkSize;
        } else {
          for (const addr of chunk) {
            try {
              const result = await operation([addr]);
              results.push(...result);
            } catch (e) {
              results.push(false);
            }
          }
        }
      }
    }
    
    return results;
  }
  
  adjustChunkSize(currentChunkSize, duration, minChunkSize, maxChunkSize) {
    const targetDuration = 5000;
    const fastResponse = 1000;   // Faster response threshold
    const goodResponse = 3000;   // Good response threshold
    const slowResponse = 8000;   // Slow response threshold
    const verySlowResponse = 15000; // Very slow response threshold
    
    // Very fast response: 3x increase
    if (duration < fastResponse) {
      const newSize = Math.min(maxChunkSize, Math.floor(currentChunkSize * 3.0));
      if (newSize > currentChunkSize) {
        console.log(`[ChunkAdjust] Very fast response (${duration}ms): ${currentChunkSize} → ${newSize}`);
        return newSize;
      }
    }
    // Fast response: 2x increase
    else if (duration < goodResponse) {
      const newSize = Math.min(maxChunkSize, Math.floor(currentChunkSize * 2.0));
      if (newSize > currentChunkSize) {
        console.log(`[ChunkAdjust] Fast response (${duration}ms): ${currentChunkSize} → ${newSize}`);
        return newSize;
      }
    }
    // Good response: 1.5x increase
    else if (duration < targetDuration) {
      const newSize = Math.min(maxChunkSize, Math.floor(currentChunkSize * 1.5));
      if (newSize > currentChunkSize) {
        console.log(`[ChunkAdjust] Good response (${duration}ms): ${currentChunkSize} → ${newSize}`);
        return newSize;
      }
    }
    // Very slow response: 50% reduction
    else if (duration > verySlowResponse) {
      const newSize = Math.max(minChunkSize, Math.floor(currentChunkSize * 0.5));
      console.log(`[ChunkAdjust] Very slow response (${duration}ms): ${currentChunkSize} → ${newSize}`);
      return newSize;
    }
    // Slow response: 70% reduction
    else if (duration > slowResponse) {
      const newSize = Math.max(minChunkSize, Math.floor(currentChunkSize * 0.7));
      console.log(`[ChunkAdjust] Slow response (${duration}ms): ${currentChunkSize} → ${newSize}`);
      return newSize;
    }
    // Within target range: fine adjustment
    else if (duration > targetDuration) {
      const ratio = targetDuration / duration;
      const newSize = Math.max(minChunkSize, Math.floor(currentChunkSize * ratio));
      if (newSize < currentChunkSize * 0.9) {
        console.log(`[ChunkAdjust] Adjusting (${duration}ms): ${currentChunkSize} → ${newSize}`);
        return newSize;
      }
    }
    
    return currentChunkSize;
  }

  async isContracts(network, addresses) {
    if (!addresses?.length) return [];

    const validator = this.getValidatorContract(network);
    const rpc = this.getAlchemyClient(network);  // Use Alchemy for contract calls

    if (!validator) {
      return this.chunkOperation(addresses, async (chunk) => {
        const promises = chunk.map(async (addr) => {
          try {
            const code = await rpc.getCode(addr);
            return code && code !== '0x';
          } catch (e) {
            return false;
          }
        });
        return Promise.all(promises);
      });
    }

    return this.chunkOperation(addresses, async (chunk) => {
      // Helper function to process with retry on gas error
      const processWithRetry = async (addrs) => {
        try {
          const iface = new ethers.Interface(validator.abi);
          const checksumChunk = addrs.map(addr => ethers.getAddress(addr));
          const calldata = iface.encodeFunctionData('isContract', [checksumChunk]);

          const result = await rpc.call({
            to: ethers.getAddress(validator.address),
            data: calldata
          });

          const decoded = iface.decodeFunctionResult('isContract', result);
          return decoded[0];
        } catch (error) {
          const errorMsg = error.message || error.toString();
          const isGasError = errorMsg.includes('gas');

          // If gas error and batch size > 1, try with half size
          if (isGasError && addrs.length > 1) {
            console.log(`[isContracts] Gas error with ${addrs.length} addresses, retrying with half size`);
            const midpoint = Math.floor(addrs.length / 2);
            const firstHalf = await processWithRetry(addrs.slice(0, midpoint));
            const secondHalf = await processWithRetry(addrs.slice(midpoint));
            return [...firstHalf, ...secondHalf];
          }

          // No fallback - throw the error
          throw error;
        }
      };

      return processWithRetry(chunk);
    });
  }

  async fetchNativeBalances(network, addresses) {
    if (!addresses?.length) return [];

    const balanceHelper = this.getBalanceContract(network);
    const rpc = this.getAlchemyClient(network);

    if (!balanceHelper) {
      return this.chunkOperation(addresses, async (chunk) => {
        const promises = chunk.map(async (addr) => {
          try {
            const balance = await rpc.getBalance(addr);
            return balance;
          } catch (e) {
            return '0x0';
          }
        });
        return Promise.all(promises);
      });
    }

    return this.chunkOperation(addresses, async (chunk) => {
      try {
        const iface = new ethers.Interface(balanceHelper.abi);
        const checksumChunk = chunk.map(addr => ethers.getAddress(addr));
        const calldata = iface.encodeFunctionData('getNativeBalance', [checksumChunk]);

        const result = await rpc.call({
          to: ethers.getAddress(balanceHelper.address),
          data: calldata
        });

        const decoded = iface.decodeFunctionResult('getNativeBalance', result);
        return decoded[0];
      } catch (error) {
        const promises = chunk.map(async (addr) => {
          try {
            const balance = await rpc.getBalance(addr);
            return balance;
          } catch (e) {
            return '0x0';
          }
        });
        return Promise.all(promises);
      }
    });
  }

  async fetchErc20Balances(network, holders, tokens) {
    if (!holders?.length || !tokens?.length) return new Map();

    const results = new Map();
    const rpc = this.getAlchemyClient(network);
    const erc20Interface = new ethers.Interface(ERC20_ABI);

    const checksumHolders = holders.map(addr => ethers.getAddress(addr));
    const checksumTokens = tokens.map(addr => ethers.getAddress(addr));

    for (let i = 0; i < holders.length; i++) {
      const holder = holders[i];
      const checksumHolder = checksumHolders[i];
      const holderMap = new Map();

      for (let j = 0; j < tokens.length; j++) {
        const token = tokens[j];
        const checksumToken = checksumTokens[j];

        try {
          const calldata = erc20Interface.encodeFunctionData('balanceOf', [checksumHolder]);

          const result = await rpc.call({
            to: checksumToken,
            data: calldata
          });

          const decoded = erc20Interface.decodeFunctionResult('balanceOf', result);
          holderMap.set(token, decoded[0].toString());
        } catch (error) {
          holderMap.set(token, '0');
        }
      }

      results.set(holder, holderMap);
    }

    return results;
  }

  async getCodeHashes(network, addresses) {
    if (!addresses?.length) return [];

    const validator = this.getValidatorContract(network);
    const rpc = this.getAlchemyClient(network);  // Use Alchemy for contract calls

    if (!validator) {
      return this.chunkOperation(addresses, async (chunk) => {
        const promises = chunk.map(async (addr) => {
          try {
            const code = await rpc.getCode(addr);
            return code && code !== '0x' ? ethers.keccak256(code) : ZERO_HASH;
          } catch (e) {
            return ZERO_HASH;
          }
        });
        return Promise.all(promises);
      });
    }

    return this.chunkOperation(addresses, async (chunk) => {
      // Helper function to process with retry on gas error
      const processWithRetry = async (addrs) => {
        try {
          const iface = new ethers.Interface(validator.abi);
          const checksumChunk = addrs.map(addr => ethers.getAddress(addr));
          const calldata = iface.encodeFunctionData('getCodeHashes', [checksumChunk]);

          const result = await rpc.call({
            to: ethers.getAddress(validator.address),
            data: calldata
          });

          const decoded = iface.decodeFunctionResult('getCodeHashes', result);
          return decoded[0];
        } catch (error) {
          const errorMsg = error.message || error.toString();
          const isGasError = errorMsg.includes('gas');

          // If gas error and batch size > 1, try with half size
          if (isGasError && addrs.length > 1) {
            console.log(`[getCodeHashes] Gas error with ${addrs.length} addresses, retrying with half size`);
            const midpoint = Math.floor(addrs.length / 2);
            const firstHalf = await processWithRetry(addrs.slice(0, midpoint));
            const secondHalf = await processWithRetry(addrs.slice(midpoint));
            return [...firstHalf, ...secondHalf];
          }

          // No fallback - throw the error
          throw error;
        }
      };

      return processWithRetry(chunk);
    });
  }
}

const contractCall = new ContractCall();

// ====== BATCH OPERATIONS ======
async function batchOperation(items, processor, options = {}) {
  const {
    batchSize = 100,
    concurrency = 5,
    delayMs = 100,
    retries = 3
  } = options;

  const results = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const chunkSize = Math.ceil(batch.length / concurrency);
    const chunks = [];
    
    for (let j = 0; j < batch.length; j += chunkSize) {
      chunks.push(batch.slice(j, j + chunkSize));
    }
    
    const chunkPromises = chunks.map(async (chunk, idx) => {
      await sleep(delayMs * idx);
      
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          return await processor(chunk);
        } catch (error) {
          if (attempt === retries) throw error;
          await sleep(1000 * attempt);
        }
      }
    });
    
    const chunkResults = await Promise.all(chunkPromises);
    results.push(...chunkResults.flat());
    
    const processed = Math.min(i + batchSize, items.length);
    console.log(`Processed ${processed}/${items.length} items (${Math.round(processed/items.length*100)}%)`);
  }
  
  return results;
}

// ====== VALIDATION UTILITIES (FROM HELPERS.JS) ======
function isValidAddress(address) {
  try {
    return ethers.isAddress(address);
  } catch {
    return false;
  }
}

function validateFinancialValue(value) {
  // Returns true if value is valid, false otherwise
  if (value === null || value === undefined) {
    return false;
  }
  
  if (typeof value === 'number') {
    // Check for NaN, Infinity, and negative values
    return !isNaN(value) && isFinite(value) && value >= 0;
  }
  
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return !isNaN(parsed) && isFinite(parsed) && parsed >= 0;
  }
  
  return false;
}

function safeGetAddressType(address, codeHash, deploymentTime) {
  try {
    if (!address ) {
      return 'invalid';
    }
    
    if (deploymentTime === 0) {
      return 'eoa';
    }
    
    if (deploymentTime > 0) {
      return 'contract';
    }
    
    if (codeHash && codeHash !== BLOCKCHAIN_CONSTANTS.ZERO_HASH) {
      return 'contract';
    }
    
    return 'eoa';
  } catch (error) {
    console.warn(`Error in safeGetAddressType for ${address}:`, error.message);
    return 'unknown';
  }
}

function validateDeploymentTimestamp(timestamp) {
  if (timestamp === null || timestamp === undefined) {
    return null;
  }
  
  if (typeof timestamp === 'number') {
    return timestamp > 0 ? timestamp : null;
  }
  
  if (typeof timestamp === 'string') {
    const parsed = parseInt(timestamp);
    return !isNaN(parsed) && parsed > 0 ? parsed : null;
  }
  
  return null;
}

function getValidatedDeploymentTimestamp(timestamp, address) {
  try {
    const validated = validateDeploymentTimestamp(timestamp);
    
    if (validated === null) {
      console.warn(`Null deployment timestamp for address ${address}, assuming EOA (timestamp=0)`);
      return 0;
    }
    
    return validated;
  } catch (error) {
    console.warn(`Error validating deployment timestamp for ${address}:`, error.message);
    return 0;
  }
}


// ====== PROCESSING UTILITIES (FROM HELPERS.JS) ======
function chunkArray(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

async function processBatch(items, processor, options = {}) {
  const {
    batchSize = 100,
    concurrency = 1,
    delayMs = 0,
    onProgress = null,
    onError = null
  } = options;
  
  const results = [];
  const chunks = chunkArray(items, batchSize);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    
    try {
      if (concurrency === 1) {
        const result = await processor(chunk, i);
        results.push(result);
      } else {
        const subChunks = chunkArray(chunk, Math.ceil(chunk.length / concurrency));
        const promises = subChunks.map((subChunk, j) => 
          processor(subChunk, i * concurrency + j)
        );
        const subResults = await Promise.all(promises);
        results.push(...subResults);
      }
      
      if (onProgress) {
        onProgress(i + 1, chunks.length, chunk.length);
      }
      
      if (delayMs > 0 && i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      if (onError) {
        onError(error, chunk, i);
      } else {
        throw error;
      }
    }
  }
  
  return results.flat();
}

function removeDuplicates(array, keyFn = null) {
  if (!keyFn) {
    return [...new Set(array)];
  }
  
  const seen = new Set();
  return array.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}


// ====== NETWORK UTILITIES (FROM HELPERS.JS) ======
async function withRetry(operation, options = {}) {
  const {
    maxAttempts = RETRY_CONFIG.MAX_ATTEMPTS,
    baseDelay = RETRY_CONFIG.PROGRESSIVE_DELAY_BASE,
    operationName = 'operation',
    shouldRetry = () => true,
    onRetry = () => {},
  } = options;

  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      
      const delay = baseDelay * attempt;
      onRetry(error, attempt, maxAttempts, delay);
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

async function withTimeoutAndRetry(operation, timeoutMs, retryOptions = {}) {
  const timeoutOperation = async () => {
    return Promise.race([
      operation(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`${retryOptions.operationName || 'Operation'} timeout`)), timeoutMs)
      )
    ]);
  };
  
  return withRetry(timeoutOperation, retryOptions);
}


// ====== CONTRACT DEPLOYMENT UTILITIES ======

/**
 * Get contract deployment timestamps for multiple addresses using batch API
 * @param {Object} scanner - Scanner instance with etherscanCall method
 * @param {string[]} addresses - Array of contract addresses (max 5)
 * @returns {Promise<Map>} Map of address to deployment info
 */
async function getContractDeploymentTimeBatch(scanner, addresses) {
  const { getGenesisTimestamp } = require('../config/genesis-timestamps');
  const results = new Map();
  
  // Initialize all addresses with default values
  for (const address of addresses) {
    results.set(address.toLowerCase(), { timestamp: 0, isGenesis: false });
  }
  
  if (addresses.length === 0) return results;
  if (addresses.length > 5) {
    console.warn(`Batch size ${addresses.length} exceeds limit of 5, processing first 5 only`);
    addresses = addresses.slice(0, 5);
  }
  
  try {
    // Batch API call for contract creation data
    const creationData = await scanner.etherscanCall({
      module: 'contract',
      action: 'getcontractcreation',
      contractaddresses: addresses.join(',')
    });
    
    if (!creationData || !Array.isArray(creationData)) {
      console.warn('Invalid batch API response for contract creation');
      return results;
    }
    
    // Process each contract's creation data
    for (const creation of creationData) {
      if (!creation || !creation.contractAddress) continue;
      
      const address = creation.contractAddress.toLowerCase();
      const result = { timestamp: 0, isGenesis: false };
      
      // Check if it's a genesis contract
      if (creation.txHash && creation.txHash.startsWith('GENESIS')) {
        result.isGenesis = true;
        result.timestamp = getGenesisTimestamp(scanner.config?.chainId) || 0;
        results.set(address, result);
        continue;
      }
      
      // For non-genesis contracts, we need to get block timestamps
      // Store txHash for later batch processing
      if (creation.txHash) {
        results.set(address, { 
          ...result, 
          txHash: creation.txHash,
          blockNumber: null // Will be fetched next
        });
      }
    }
    
    // Batch fetch transaction details for all contracts with txHash
    const contractsWithTxHash = Array.from(results.entries())
      .filter(([_, data]) => data.txHash && !data.isGenesis);
    
    // Process transaction details one by one (can't batch eth_getTransactionByHash)
    for (const [address, data] of contractsWithTxHash) {
      try {
        const txData = await scanner.etherscanCall({
          module: 'proxy',
          action: 'eth_getTransactionByHash',
          txhash: data.txHash
        });
        
        if (txData && txData.blockNumber) {
          results.set(address, { ...data, blockNumber: txData.blockNumber });
        }
      } catch (error) {
        console.warn(`Failed to get tx data for ${address}:`, error.message);
      }
    }
    
    // Batch fetch block timestamps
    const uniqueBlockNumbers = [...new Set(
      Array.from(results.values())
        .filter(data => data.blockNumber)
        .map(data => data.blockNumber)
    )];
    
    // Fetch block details for unique block numbers
    const blockTimestamps = new Map();
    for (const blockNumber of uniqueBlockNumbers) {
      try {
        const blockData = await scanner.etherscanCall({
          module: 'proxy',
          action: 'eth_getBlockByNumber',
          tag: blockNumber,
          boolean: false
        });
        
        if (blockData && blockData.timestamp) {
          blockTimestamps.set(blockNumber, parseInt(blockData.timestamp, 16));
        }
      } catch (error) {
        console.warn(`Failed to get block data for ${blockNumber}:`, error.message);
      }
    }
    
    // Update results with timestamps
    for (const [address, data] of results.entries()) {
      if (data.blockNumber && blockTimestamps.has(data.blockNumber)) {
        results.set(address, {
          timestamp: blockTimestamps.get(data.blockNumber),
          isGenesis: data.isGenesis || false
        });
      } else if (!data.isGenesis) {
        // Keep default values for contracts without timestamps
        results.set(address, { timestamp: 0, isGenesis: false });
      }
    }
    
    return results;
  } catch (error) {
    console.warn(`Batch deployment time fetch failed:`, error.message);
    return results;
  }
}

/**
 * Get contract deployment timestamp using Etherscan API (single address)
 * @param {Object} scanner - Scanner instance with etherscanCall method
 * @param {string} address - Contract address
 * @returns {Promise<{timestamp: number, isGenesis: boolean}>} Deployment timestamp and genesis flag
 */
async function getContractDeploymentTime(scanner, address) {
  const { getGenesisTimestamp } = require('../config/genesis-timestamps');
  const result = { timestamp: 0, isGenesis: false };
  
  try {
    const creationData = await scanner.etherscanCall({
      module: 'contract',
      action: 'getcontractcreation',
      contractaddresses: address
    });
    
    if (creationData && creationData.length > 0) {
      const creation = creationData[0];
      
      // Check if it's a genesis contract
      if (creation.txHash && creation.txHash.startsWith('GENESIS')) {
        result.isGenesis = true;
        // For genesis contracts, use network genesis timestamp from config
        result.timestamp = getGenesisTimestamp(scanner.config?.chainId) || 0;
        return result;
      }
      
      if (creation.txHash) {
        // Get transaction details to get timestamp
        const txData = await scanner.etherscanCall({
          module: 'proxy',
          action: 'eth_getTransactionByHash',
          txhash: creation.txHash
        });
        
        if (txData && txData.blockNumber) {
          // Get block details to get timestamp
          const blockData = await scanner.etherscanCall({
            module: 'proxy',
            action: 'eth_getBlockByNumber',
            tag: txData.blockNumber,
            boolean: false
          });
          
          if (blockData && blockData.timestamp) {
            result.timestamp = parseInt(blockData.timestamp, 16);
            return result;
          }
        }
      }
    }
    
    return result;
  } catch (error) {
    console.warn(`Failed to get deployment time for ${address}:`, error.message);
    return result;
  }
}

// ====== CONTRACT UTILITIES (MISSING FROM CONTRACTUTILS.JS) ======

async function getContractNameWithProxy(scanner, address, sourceData) {
  if (!sourceData || !sourceData.ContractName) {
    return null;
  }

  const isProxy = sourceData.Proxy === '1';
  let finalContractName = sourceData.ContractName || 'Unknown';
  
  if (isProxy && sourceData.Implementation) {
    try {
      const implResponse = await scanner.etherscanCall({
        module: 'contract',
        action: 'getsourcecode',
        address: sourceData.Implementation
      });
      
      if (implResponse && implResponse.length > 0 && implResponse[0].ContractName) {
        finalContractName = implResponse[0].ContractName;
        scanner.log(`🔗 Proxy ${address} -> Implementation: ${finalContractName}`);
      }
      
      await sleep(200);
    } catch (error) {
      console.warn(`Error getting implementation name for proxy ${address}:`, error.message);
    }
  }
  
  return finalContractName;
}

// ====== EXPORTS ======
module.exports = {
  // Constants
  BATCH_SIZES,
  TIMEOUTS,
  RETRY_CONFIG,
  PERFORMANCE,
  PROCESSING,
  NETWORK_LIST,
  BLOCKCHAIN_CONSTANTS,
  API_LIMITS,
  ZERO_HASH,
  
  // Basic utils
  now,
  sleep,
  normalizeAddress,
  normalizeAddressArray,
  
  // Validation utilities
  isValidAddress,
  validateFinancialValue,
  safeGetAddressType,
  validateDeploymentTimestamp,
  getValidatedDeploymentTimestamp,
  
  // Processing utilities
  chunkArray,
  processBatch,
  removeDuplicates,
  
  // Network utilities
  withRetry,
  withTimeoutAndRetry,
  
  // Database
  initializeDB,
  closeDB,
  
  // API Limiter
  APILimiter,
  globalAPILimiter,
  
  // Etherscan
  initEtherscan,
  etherscanRequest,
  etherscanCall: etherscanRequest,  // Alias for compatibility
  
  // HTTP RPC
  HttpRpcClient,
  AlchemyRPCClient,
  createRpcClient,
  createLogsRpcClient,
  createAlchemyRpcClient,
  
  // Contract operations
  contractCall,
  
  // Contract utilities
  getContractDeploymentTime,
  getContractDeploymentTimeBatch,
  getContractNameWithProxy,
  
  // Batch operations
  batchOperation
};

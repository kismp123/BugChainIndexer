/**
 * Alchemy RPC Client
 * Dedicated client for all Alchemy RPC calls (except getLogs)
 * Can use either Alchemy proxy server or direct Alchemy API based on configuration
 */

const axios = require('axios');
const { NETWORKS } = require('../config/networks');

class AlchemyRPCClient {
  constructor(network) {
    this.network = network;
    this.requestId = 0;
    this.detectedTier = null; // Will be set after tier detection

    // Check if proxy should be used
    const useProxy = process.env.USE_ALCHEMY_PROXY === 'true';

    if (useProxy) {
      // Use Alchemy proxy server
      this.proxyUrl = process.env.ALCHEMY_PROXY_URL || 'http://localhost:3002';
      this.alchemyUrl = `${this.proxyUrl}/rpc/${this.network}`;
      this.useProxy = true;
      console.log(`[${network}] AlchemyRPC: Using proxy at ${this.proxyUrl}`);
    } else {
      // Use direct Alchemy API
      const apiKey = process.env.ALCHEMY_API_KEY;
      if (!apiKey) {
        throw new Error('ALCHEMY_API_KEY not configured and USE_ALCHEMY_PROXY is false');
      }

      // Get network config for Alchemy endpoint
      const networkConfig = NETWORKS[network];
      const alchemyNetwork = networkConfig?.alchemyNetwork || network;

      // Construct direct Alchemy URL
      this.alchemyUrl = `https://${alchemyNetwork}.g.alchemy.com/v2/${apiKey}`;
      this.useProxy = false;
      console.log(`[${network}] AlchemyRPC: Using direct Alchemy API for ${alchemyNetwork}`);
    }
  }

  /**
   * Detect Alchemy tier using the has-paid-tier API server
   * Returns 'free' or 'growth' based on hasPaidTier flag
   */
  async detectTier() {
    if (this.detectedTier) {
      return this.detectedTier;
    }

    // Try API-based detection
    const tierDetectionUrl = process.env.ALCHEMY_TIER_DETECTION_URL || 'http://localhost:3002';

    try {
      // Extract API key from URL if using direct API (not proxy)
      let apiKey = null;
      if (!this.useProxy && this.alchemyUrl) {
        const match = this.alchemyUrl.match(/\/v2\/([^/]+)$/);
        if (match) {
          apiKey = match[1];
        }
      }

      if (!this.useProxy && !apiKey) {
        throw new Error('No API key available for tier detection in direct mode');
      }

      // Try server-based tier detection
      // If using proxy mode, send network as query param
      // If using direct mode, send apiKey and network as query params
      const params = new URLSearchParams();
      params.append('network', this.network);
      if (!this.useProxy && apiKey) {
        params.append('apiKey', apiKey);
      }

      const response = await axios.get(`${tierDetectionUrl}/api-keys/has-paid-tier?${params.toString()}`, {
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      if (response.data && response.data.success && typeof response.data.hasPaidTier === 'boolean') {
        const hasPaidTier = response.data.hasPaidTier;
        this.detectedTier = hasPaidTier ? 'growth' : 'free';
        console.log(`[${this.network}] Detected Alchemy tier via API: ${this.detectedTier} (hasPaidTier: ${hasPaidTier})`);
        return this.detectedTier;
      }
    } catch (error) {
      console.warn(`[${this.network}] API tier detection failed, falling back to local detection:`, error.message);
    }

    // Fallback: Local tier detection by testing getLogs
    try {
      const currentBlock = await this.getBlockNumber();
      const testRanges = [
        { range: 100, tier: 'growth' },   // Test if we can do 100 blocks
        { range: 11, tier: 'free' }       // Fallback to free tier
      ];

      for (const test of testRanges) {
        try {
          // Try getLogs with test range
          await this.makeRequest('eth_getLogs', [{
            fromBlock: `0x${(currentBlock - test.range).toString(16)}`,
            toBlock: `0x${currentBlock.toString(16)}`,
            topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'] // Transfer event
          }]);

          // If successful, this tier or higher
          if (test.range === 100) {
            this.detectedTier = 'growth';
            console.log(`[${this.network}] Detected Alchemy tier (local test): growth or higher`);
            return this.detectedTier;
          }
        } catch (error) {
          // If failed, try next lower tier
          continue;
        }
      }

      // If all tests failed or only 11 blocks worked
      this.detectedTier = 'free';
      console.log(`[${this.network}] Detected Alchemy tier (local test): free`);
      return this.detectedTier;

    } catch (error) {
      console.warn(`[${this.network}] All tier detection failed, assuming free tier:`, error.message);
      this.detectedTier = 'free';
      return this.detectedTier;
    }
  }
  
  async makeRequest(method, params = []) {
    this.requestId++;
    const payload = {
      jsonrpc: '2.0',
      method,
      params,
      id: this.requestId
    };
    
    try {
      const response = await axios.post(this.alchemyUrl, payload, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: (status) => status < 500,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024
      });
      
      if (response.data.error) {
        throw new Error(`Alchemy RPC Error: ${response.data.error.message} (code: ${response.data.error.code})`);
      }
      
      if (!response.data.result && response.data.result !== null && response.data.result !== false) {
        throw new Error('Invalid Alchemy RPC response: missing result');
      }
      
      return response.data.result;
      
    } catch (error) {
      console.error(`[${this.network}] Alchemy RPC error for ${method}: ${error.message}`);
      throw error;
    }
  }
  
  // Contract call method (eth_call)
  async call(transaction) {
    return this.makeRequest('eth_call', [transaction, 'latest']);
  }
  
  // Get block number
  async getBlockNumber() {
    const result = await this.makeRequest('eth_blockNumber');
    return parseInt(result, 16);
  }
  
  // Get block by number
  async getBlock(blockNumber) {
    const blockHex = typeof blockNumber === 'number' ? '0x' + blockNumber.toString(16) : blockNumber;
    return this.makeRequest('eth_getBlockByNumber', [blockHex, false]);
  }

  // Alias for getBlock with includeTxs parameter
  async getBlockByNumber(blockNumber, includeTxs = false) {
    const blockHex = typeof blockNumber === 'number' ? '0x' + blockNumber.toString(16) : blockNumber;
    return this.makeRequest('eth_getBlockByNumber', [blockHex, includeTxs]);
  }
  
  // Get block by hash
  async getBlockByHash(blockHash, includeTransactions = false) {
    return this.makeRequest('eth_getBlockByHash', [blockHash, includeTransactions]);
  }
  
  // Get transaction by hash
  async getTransaction(txHash) {
    return this.makeRequest('eth_getTransactionByHash', [txHash]);
  }

  // Alias for getTransaction
  async getTransactionByHash(txHash) {
    return this.getTransaction(txHash);
  }
  
  // Get transaction receipt
  async getTransactionReceipt(txHash) {
    return this.makeRequest('eth_getTransactionReceipt', [txHash]);
  }
  
  // Get code at address
  async getCode(address) {
    return this.makeRequest('eth_getCode', [address, 'latest']);
  }
  
  // Get balance
  async getBalance(address, blockTag = 'latest') {
    return this.makeRequest('eth_getBalance', [address, blockTag]);
  }
  
  // Get storage at position
  async getStorageAt(address, position, blockTag = 'latest') {
    return this.makeRequest('eth_getStorageAt', [address, position, blockTag]);
  }

  // Get logs
  async getLogs(filter) {
    return this.makeRequest('eth_getLogs', [filter]);
  }

  // Get transaction count (nonce)
  async getTransactionCount(address, blockTag = 'latest') {
    const result = await this.makeRequest('eth_getTransactionCount', [address, blockTag]);
    return parseInt(result, 16);
  }
  
  // Estimate gas
  async estimateGas(transaction) {
    return this.makeRequest('eth_estimateGas', [transaction]);
  }
  
  // Get gas price
  async getGasPrice() {
    return this.makeRequest('eth_gasPrice');
  }
  
  // Get token prices by symbol (Alchemy Prices API - REST endpoint)
  async getTokenPricesBySymbol(symbols) {
    if (!Array.isArray(symbols) || symbols.length === 0) {
      throw new Error('symbols must be a non-empty array');
    }

    try {
      let url, params;

      if (this.useProxy) {
        // Use Alchemy proxy for Prices API
        url = `${this.proxyUrl}/prices/tokens/by-symbol`;
        params = new URLSearchParams();
        symbols.forEach(symbol => {
          params.append('symbols', symbol);
        });
      } else {
        // Use direct Alchemy Prices API REST endpoint
        const apiKey = process.env.ALCHEMY_API_KEY;
        if (!apiKey) {
          throw new Error('ALCHEMY_API_KEY not configured for Prices API');
        }

        url = `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-symbol`;
        params = new URLSearchParams();

        // Add each symbol as a separate 'symbols' parameter
        symbols.forEach(symbol => {
          params.append('symbols', symbol);
        });
      }

      const response = await axios.get(`${url}?${params.toString()}`, {
        headers: {
          'Accept': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      throw new Error(`Failed to fetch token prices by symbol: ${errorMsg}`);
    }
  }

  // Get token metadata (includes decimals)
  async getTokenMetadata(contractAddress) {
    return this.makeRequest('alchemy_getTokenMetadata', [contractAddress]);
  }

  // Get chain ID
  async getChainId() {
    const result = await this.makeRequest('eth_chainId');
    return parseInt(result, 16);
  }
  
  // Send raw transaction
  async sendRawTransaction(signedTx) {
    return this.makeRequest('eth_sendRawTransaction', [signedTx]);
  }
  
  // Get uncle by block hash and index
  async getUncleByBlockHashAndIndex(blockHash, index) {
    const indexHex = '0x' + index.toString(16);
    return this.makeRequest('eth_getUncleByBlockHashAndIndex', [blockHash, indexHex]);
  }
  
  // Get uncle by block number and index
  async getUncleByBlockNumberAndIndex(blockNumber, index) {
    const blockHex = '0x' + blockNumber.toString(16);
    const indexHex = '0x' + index.toString(16);
    return this.makeRequest('eth_getUncleByBlockNumberAndIndex', [blockHex, indexHex]);
  }
  
  // Get block transaction count by hash
  async getBlockTransactionCountByHash(blockHash) {
    const result = await this.makeRequest('eth_getBlockTransactionCountByHash', [blockHash]);
    return parseInt(result, 16);
  }
  
  // Get block transaction count by number
  async getBlockTransactionCountByNumber(blockNumber) {
    const blockHex = '0x' + blockNumber.toString(16);
    const result = await this.makeRequest('eth_getBlockTransactionCountByNumber', [blockHex]);
    return parseInt(result, 16);
  }
  
  // Get transaction by block hash and index
  async getTransactionByBlockHashAndIndex(blockHash, index) {
    const indexHex = '0x' + index.toString(16);
    return this.makeRequest('eth_getTransactionByBlockHashAndIndex', [blockHash, indexHex]);
  }
  
  // Get transaction by block number and index
  async getTransactionByBlockNumberAndIndex(blockNumber, index) {
    const blockHex = '0x' + blockNumber.toString(16);
    const indexHex = '0x' + index.toString(16);
    return this.makeRequest('eth_getTransactionByBlockNumberAndIndex', [blockHex, indexHex]);
  }
}

module.exports = { AlchemyRPCClient };
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
  
  // Get block by hash
  async getBlockByHash(blockHash, includeTransactions = false) {
    return this.makeRequest('eth_getBlockByHash', [blockHash, includeTransactions]);
  }
  
  // Get transaction by hash
  async getTransaction(txHash) {
    return this.makeRequest('eth_getTransactionByHash', [txHash]);
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
/* eslint-disable no-console */
/**
 * Fund Updater Scanner - Refactored
 * Updates asset prices and balances using efficient batch operations
 */
const axios = require('axios');
const Scanner = require('../common/Scanner');
// Token addresses loaded from network config
const { batchUpsertAddresses, normalizeAddress, validateFinancialValue } = require('../common');
const CONFIG = require('../config/networks.js');
const MultiSourcePriceHelper = require('../common/MultiSourcePriceHelper');
const TokenDataLoader = require('../common/TokenDataLoader');

class FundUpdater extends Scanner {
  constructor() {
    super('FundUpdater', {
      timeout: 7200,
      batchSizes: {
        addresses: 1000,
        tokens: 100,
        prices: 50
      }
    });
    
    this.priceCache = new Map();
    this.delayDays = CONFIG.FUNDUPDATEDELAY || 7;
    
    // Initialize price helpers
    this.multiSourcePriceHelper = new MultiSourcePriceHelper();
    this.tokenDataLoader = new TokenDataLoader();
    
    // Dynamic batch sizing for balance calls
    this.currentBatchSize = 200;  // Start with 200
    this.minBatchSize = 20;       // Minimum batch size
    this.maxBatchSize = 500;      // Maximum batch size
    this.failureCount = 0;        // Track consecutive failures
    this.successCount = 0;        // Track consecutive successes
  }

  // Adjust batch size based on success/failure patterns
  adjustBatchSize(isSuccess) {
    if (isSuccess) {
      this.successCount++;
      this.failureCount = 0;
      
      // After 3 consecutive successes, try to increase batch size
      if (this.successCount >= 3 && this.currentBatchSize < this.maxBatchSize) {
        this.currentBatchSize = Math.min(this.maxBatchSize, this.currentBatchSize + 50);
        this.log(`🔼 Increased batch size to ${this.currentBatchSize} after consecutive successes`);
        this.successCount = 0;
      }
    } else {
      this.failureCount++;
      this.successCount = 0;
      
      // On any failure, reduce batch size immediately
      if (this.currentBatchSize > this.minBatchSize) {
        this.currentBatchSize = Math.max(this.minBatchSize, Math.floor(this.currentBatchSize * 0.6));
        this.log(`🔽 Reduced batch size to ${this.currentBatchSize} after failure`);
      }
    }
  }

  // Split addresses into dynamic-sized chunks
  chunkAddresses(addresses) {
    const chunks = [];
    for (let i = 0; i < addresses.length; i += this.currentBatchSize) {
      chunks.push(addresses.slice(i, i + this.currentBatchSize));
    }
    return chunks;
  }

  async getOutdatedAddresses() {
    const allFlag = process.env.ALL_FLAG;
    const highFundFlag = process.env.HIGH_FUND_FLAG; // New flag for high fund addresses
    const cutoffTime = allFlag ? 0xffffffff : (this.currentTime - this.delayDays * 24 * 60 * 60);
    const maxBatch = parseInt(process.env.FUND_UPDATE_MAX_BATCH || '50000', 10);
    const minFund = highFundFlag ? 100000 : 0; // Filter for 100K+ funds
    
    this.log(`🔍 ALL_FLAG: ${allFlag}, HIGH_FUND_FLAG: ${highFundFlag}`);
    this.log(`🔍 cutoffTime: ${cutoffTime}, maxBatch: ${maxBatch}`);

    // Optimized query with array operations instead of LIKE for better performance
    // Allow processing addresses even without code_hash if ALL_FLAG is set
    let query = `
      SELECT address FROM addresses
      WHERE network = $1`;
    
    let params = [this.network];  // $1: network filter
    
    // Add conditions based on flags
    if (!allFlag) {
      query += `
      AND (last_fund_updated IS NULL OR last_fund_updated < $2)
      AND code_hash IS NOT NULL 
      AND code_hash != $3
      AND code_hash != ''`;
      params.push(cutoffTime);        // $2: cutoff timestamp
      params.push(this.ZERO_HASH);    // $3: zero hash to exclude
    }
    
    query += `
      AND (tags IS NULL OR NOT ('EOA' = ANY(tags)))`;
    
    // Add high fund filter if enabled
    if (highFundFlag) {
      const fundParamIndex = allFlag ? '$2' : '$4';
      const limitParamIndex = allFlag ? '$3' : '$5';
      
      query += ` AND fund >= ${fundParamIndex}`;
      params.push(minFund);
      query += ` ORDER BY fund DESC, last_fund_updated ASC NULLS FIRST LIMIT ${limitParamIndex}`;
      params.push(maxBatch);
      
      this.log(`🏛️ High fund mode enabled: targeting addresses with fund >= ${minFund.toLocaleString()}`);
    } else {
      const limitParamIndex = allFlag ? '$2' : '$4';
      query += ` ORDER BY last_fund_updated ASC NULLS FIRST LIMIT ${limitParamIndex}`;
      params.push(maxBatch);
    }
    
    this.log(`🔍 Query: ${query}`);
    this.log(`🔍 Params: ${JSON.stringify(params)}`);
    
    const result = await this.queryDB(query, params);  // Skip cache for debugging
    const addresses = result.rows.map(row => row.address);
    
    this.log(`🔍 Query returned ${addresses.length} addresses`);
    
    if (highFundFlag) {
      this.log(`📊 Found ${addresses.length} high-value addresses (fund >= ${minFund.toLocaleString()}) for update`);
    }
    
    return addresses;
  }

  async fetchTokenPrices(tokenAddresses) {
    // First try to load prices from database
    await this.loadPricesFromDatabase();
    
    // Check if we need to update prices (7-day cache)
    const needsPriceUpdate = await this.needsPriceUpdate();
    
    if (needsPriceUpdate) {
      const updateIntervalDays = parseInt(process.env.PRICE_UPDATE_INTERVAL_DAYS) || 7;
      const forceUpdate = process.env.FORCE_PRICE_UPDATE === 'true' || 
                         process.argv.includes('--force-price-update');
      
      if (forceUpdate) {
        this.log('🔄 Force updating token prices...');
      } else {
        this.log(`🔄 Updating token prices (${updateIntervalDays}-day refresh)...`);
      }
      await this.updateTokenPricesFromAPI(tokenAddresses);
    } else {
      this.log('💰 Using cached token prices from database');
    }

    return this.priceCache;
  }

  async needsPriceUpdate() {
    try {
      // Check for force update flags
      const forceUpdate = process.env.FORCE_PRICE_UPDATE === 'true' || 
                         process.argv.includes('--force-price-update');
      
      if (forceUpdate) {
        this.log('🔄 Force updating token prices (--force-price-update flag)');
        return true;
      }
      
      const result = await this.queryDB(`
        SELECT MAX(price_updated) as last_update 
        FROM tokens 
        WHERE network = $1 AND price IS NOT NULL
      `, [this.network]);
      
      if (!result.rows[0]?.last_update) {
        return true; // No prices found, need update
      }
      
      const lastUpdate = parseInt(result.rows[0].last_update);
      
      // Configurable update interval (default: 7 days)
      const updateIntervalDays = parseInt(process.env.PRICE_UPDATE_INTERVAL_DAYS) || 7;
      const updateIntervalSeconds = updateIntervalDays * 24 * 60 * 60;
      const intervalAgo = this.currentTime - updateIntervalSeconds;
      
      const needsUpdate = lastUpdate < intervalAgo;
      
      if (needsUpdate) {
        this.log(`🔄 Token prices older than ${updateIntervalDays} days, updating...`);
      } else {
        const daysSinceUpdate = Math.floor((this.currentTime - lastUpdate) / (24 * 60 * 60));
        this.log(`💰 Token prices are fresh (${daysSinceUpdate} days old, interval: ${updateIntervalDays} days)`);
      }
      
      return needsUpdate;
    } catch (error) {
      this.log(`Error checking price update status: ${error.message}`, 'warn');
      return true; // On error, try to update
    }
  }

  async loadPricesFromDatabase() {
    try {
      // Load native token price for current network
      const nativePrice = await this.getNativeTokenPrice();
      const nativeCurrency = this.getNativeCurrencyId();
      this.priceCache.set(nativeCurrency, nativePrice);
      
      // Load ERC-20 token prices from database
      const result = await this.queryDB(`
        SELECT token_address, price 
        FROM tokens 
        WHERE network = $1 AND price IS NOT NULL AND is_valid = true
      `, [this.network]);
      
      result.rows.forEach(row => {
        this.priceCache.set(row.token_address.toLowerCase(), parseFloat(row.price) || 0);
      });
      
      this.log(`📊 Loaded ${this.priceCache.size} token prices from database (${nativeCurrency} + ${result.rows.length} tokens)`);
    } catch (error) {
      this.log(`Error loading prices from database: ${error.message}`, 'warn');
    }
  }

  getNativeCurrencyId() {
    // Map network native currency to CoinGecko ID
    const nativeCurrencyMap = {
      'ETH': 'ethereum',
      'BNB': 'binancecoin', 
      'MATIC': 'matic-network',
      'AVAX': 'avalanche-2',
      'FTM': 'fantom',
      'xDAI': 'xdai',
      'MOVR': 'moonriver',
      'GLMR': 'moonbeam',
      'CRO': 'crypto-com-chain',
      'CELO': 'celo',
      'MNT': 'mantle'
    };

    const nativeCurrency = this.config?.nativeCurrency || 'ETH';
    return nativeCurrencyMap[nativeCurrency] || 'ethereum';
  }

  // Unified API request method with auto-detection and fallback
  async makeApiRequest(endpoint, params) {
    // Auto-detect API mode on first call
    if (!this.apiModeDetected && this.coinGeckoKey) {
      await this.detectApiMode();
    }

    // If no API key or deactivated, use free API
    if (!this.coinGeckoKey || this.apiMode === 'free') {
      const response = await axios.get(`https://api.coingecko.com/api/v3${endpoint}`, {
        params,
        timeout: 15000
      });
      return { response, mode: 'free' };
    }

    // Try Pro API first
    if (this.apiMode === 'pro') {
      try {
        const proParams = { ...params, x_cg_pro_api_key: this.coinGeckoKey };
        const response = await axios.get(`https://pro-api.coingecko.com/api/v3${endpoint}`, {
          params: proParams,
          timeout: 15000
        });
        return { response, mode: 'pro' };
      } catch (proError) {
        // If Pro API fails due to deactivation, fallback to Demo
        if (proError.response?.data?.status?.error_code === 10004) {
          this.log('⚠️  Pro API key deactivated, switching to Demo mode with header', 'warn');
          this.apiMode = 'demo';
          // Retry with Demo API
          return this.makeApiRequest(endpoint, params);
        }
        throw proError;
      }
    }

    // Try Demo API with header (works better than params)
    if (this.apiMode === 'demo') {
      try {
        const response = await axios.get(`https://api.coingecko.com/api/v3${endpoint}`, {
          params,
          headers: {
            'x-cg-demo-api-key': this.coinGeckoKey
          },
          timeout: 15000
        });
        return { response, mode: 'demo' };
      } catch (demoError) {
        // If Demo API fails with 400, try free API for token endpoints
        if (demoError.response?.status === 400 && endpoint.includes('token_price')) {
          this.log('⚠️  Demo API doesn\'t support token prices, using free API', 'warn');
          const response = await axios.get(`https://api.coingecko.com/api/v3${endpoint}`, {
            params,
            timeout: 15000
          });
          return { response, mode: 'free' };
        }
        throw demoError;
      }
    }

    // Should not reach here
    throw new Error('Invalid API mode');
  }

  // Detect which API tier the key belongs to
  async detectApiMode() {
    if (!this.coinGeckoKey) {
      this.apiMode = 'free';
      this.apiModeDetected = true;
      this.log('📊 No API key provided, using free tier', 'info');
      return;
    }

    this.log(`🔍 Detecting API mode for key: ${this.coinGeckoKey.substring(0, 10)}...`, 'info');

    // Test if the key works as Demo API with header first
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
        params: { ids: 'ethereum', vs_currencies: 'usd' },
        headers: { 'x-cg-demo-api-key': this.coinGeckoKey },
        timeout: 10000
      });
      
      if (response.data?.ethereum?.usd) {
        this.log('🔑 API key works as Demo API (using header method)', 'info');
        this.apiMode = 'demo';
        this.apiModeDetected = true;
        return;
      }
    } catch (error) {
      // Continue to test other modes
    }

    // Test Pro API first
    try {
      const response = await axios.get('https://pro-api.coingecko.com/api/v3/key', {
        params: { x_cg_pro_api_key: this.coinGeckoKey },
        timeout: 10000
      });
      
      if (response.data?.plan) {
        this.apiMode = 'pro';
        this.apiModeDetected = true;
        this.log(`✅ Pro API detected - Plan: ${response.data.plan}, Limit: ${response.data.rate_limit_request_per_minute} req/min`, 'info');
        return;
      }
    } catch (proError) {
      if (proError.response?.data?.status?.error_code === 10004) {
        this.log('⚠️  API key is DEACTIVATED (subscription expired). Will retry with Pro API anyway.', 'warn');
        this.apiMode = 'pro'; // Still use pro mode, expecting reactivation
        this.apiModeDetected = true;
        return;
      }
      if (proError.response?.status === 400) {
        // Might be a demo key, continue to test demo API
      }
    }

    // Test Demo API
    try {
      const response = await axios.get('https://api.coingecko.com/api/v3/ping', {
        params: { x_cg_demo_api_key: this.coinGeckoKey },
        timeout: 10000
      });
      
      if (response.data?.gecko_says) {
        this.apiMode = 'demo';
        this.apiModeDetected = true;
        this.log('✅ Demo API detected - 30 req/min, 10,000 calls/month', 'info');
        return;
      }
    } catch (demoError) {
      // Demo key also failed
    }

    // Default to pro if we have a key
    this.log('🆗 Assuming Pro API mode for provided key', 'info');
    this.apiMode = 'pro';
    this.apiModeDetected = true;
  }

  // Get CoinGecko platform ID for the current network
  getCoinGeckoPlatformId() {
    const platformMap = {
      'ethereum': 'ethereum',
      'binance': 'binance-smart-chain',
      'polygon': 'polygon-pos',
      'arbitrum': 'arbitrum-one',
      'optimism': 'optimistic-ethereum',
      'base': 'base',
      'avalanche': 'avalanche',
      'gnosis': 'xdai',
      'linea': 'linea',
      'scroll': 'scroll',
      'mantle': 'mantle',
      'opbnb': 'opbnb',
      'polygon-zkevm': 'polygon-zkevm',
      'arbitrum-nova': 'arbitrum-nova',
      'celo': 'celo',
      'cronos': 'cronos',
      'moonbeam': 'moonbeam',
      'moonriver': 'moonriver'
    };

    return platformMap[this.network] || 'ethereum';
  }

  async getNativeTokenPrice() {
    const nativeSymbol = this.config?.nativeCurrency || 'ETH';
    
    try {
      // Try multi-source price helper first (Binance, Kraken, etc.)
      const multiPrice = await this.multiSourcePriceHelper.getPrice(nativeSymbol);
      
      if (multiPrice) {
        // Get source info from cache
        const cached = this.multiSourcePriceHelper.cache.get(nativeSymbol.toUpperCase());
        const source = cached?.source || 'unknown';
        this.log(`💰 ${nativeSymbol} price: $${multiPrice} (source: ${source})`);
        return multiPrice;
      }
      
      // If multi-source fails, try CoinGecko API
      this.log(`Multi-source failed for ${nativeSymbol}, trying CoinGecko...`);
      const coinId = this.getNativeCurrencyId();
      const params = {
        ids: coinId,
        vs_currencies: 'usd'
      };

      const { response, mode } = await this.makeApiRequest('/simple/price', params);
      const price = response.data?.[coinId]?.usd || 0;
      
      if (price) {
        this.log(`💰 ${nativeSymbol} price: $${price} (${mode.toUpperCase()} API)`);
        return price;
      }
    } catch (error) {
      // Handle rate limit specifically
      if (error.response?.status === 429) {
        this.log(`⚠️ Rate limit hit fetching ${nativeSymbol} price. Waiting 60s...`, 'warn');
        await this.sleep(60000);
        // Retry with multi-source
        try {
          const retryPrice = await this.multiSourcePriceHelper.getPrice(nativeSymbol);
          if (retryPrice) {
            this.log(`💰 ${nativeSymbol} price: $${retryPrice} (retry succeeded)`);
            return retryPrice;
          }
        } catch (retryError) {
          this.log(`Failed to fetch ${nativeSymbol} price after retry: ${retryError.message}`, 'warn');
        }
      }
      
      this.log(`Failed to fetch ${nativeSymbol} price: ${error.message}`, 'warn');
    }
    
    return 0;
  }

  // Keep legacy method for backward compatibility  
  async getEthereumPrice() {
    return this.getNativeTokenPrice();
  }

  async updateTokenPricesFromAPI(tokenAddresses) {
    // Update native token price first
    const nativePrice = await this.getNativeTokenPrice();
    const nativeCurrencyId = this.getNativeCurrencyId();
    this.priceCache.set(nativeCurrencyId, nativePrice);
    
    if (tokenAddresses.length === 0) {
      this.log('No ERC-20 tokens to update');
      return;
    }
    
    // Batch token price requests
    const batches = [];
    for (let i = 0; i < tokenAddresses.length; i += this.batchSizes.prices) {
      batches.push(tokenAddresses.slice(i, i + this.batchSizes.prices));
    }

    const priceUpdates = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      try {
        const params = {
          vs_currencies: 'usd',
          contract_addresses: batch.join(',')
        };
        const platformId = this.getCoinGeckoPlatformId();

        const { response, mode } = await this.makeApiRequest(`/simple/token_price/${platformId}`, params);

        Object.entries(response.data).forEach(([address, data]) => {
          const price = data.usd || 0;
          this.priceCache.set(address, price);
          
          // Prepare database update
          priceUpdates.push({
            token_address: address.toLowerCase(),
            network: this.network,
            price: price,
            price_updated: this.currentTime,
            is_valid: true
          });
        });

        // Adaptive rate limiting based on API mode
        const delay = mode === 'free' ? 6000 : mode === 'demo' ? 2000 : 200; // 6s for free, 2s for demo, 200ms for pro
        if (i < batches.length - 1) { // Don't delay after last batch
          this.log(`[${i+1}/${batches.length}] Waiting ${delay/1000}s before next batch (${mode} mode)...`);
          await this.sleep(delay);
        }
      } catch (error) {
        // Handle rate limit errors specifically
        if (error.response?.status === 429) {
          this.log(`⚠️ Rate limit hit for batch ${i+1}/${batches.length}. Waiting 60 seconds...`, 'warn');
          await this.sleep(60000); // Wait 1 minute
          i--; // Retry this batch
        } else {
          this.log(`Price fetch failed for batch ${i+1}/${batches.length}: ${error.message}`, 'warn');
          
          // Try Binance as fallback for this batch
          this.log(`🔄 Attempting to fetch prices from Binance for batch ${i+1}...`);
          try {
            // Get token symbols for this batch
            const tokenSymbols = await this.getTokenSymbolsForAddresses(batch);
            if (tokenSymbols.length > 0) {
              const binancePrices = await this.binancePriceHelper.getBulkPrices(tokenSymbols.map(t => t.symbol));
              
              let successCount = 0;
              for (const token of tokenSymbols) {
                if (binancePrices[token.symbol]) {
                  this.priceCache.set(token.address, binancePrices[token.symbol]);
                  priceUpdates.push({
                    token_address: token.address.toLowerCase(),
                    network: this.network,
                    price: binancePrices[token.symbol],
                    price_updated: this.currentTime,
                    is_valid: true
                  });
                  successCount++;
                }
              }
              
              if (successCount > 0) {
                this.log(`✅ Retrieved ${successCount}/${tokenSymbols.length} prices from Binance`);
              }
            }
          } catch (binanceError) {
            this.log(`Binance fallback also failed: ${binanceError.message}`, 'warn');
          }
        }
      }
    }

    // Update database with new prices
    if (priceUpdates.length > 0) {
      await this.updateTokenPricesInDatabase(priceUpdates);
    }

    const nativeCurrency = this.config?.nativeCurrency || 'ETH';
    this.log(`💰 Updated ${this.priceCache.size} token prices (${nativeCurrency} + ${priceUpdates.length} tokens)`);
  }

  async getTokenSymbolsForAddresses(addresses) {
    try {
      // First try to get from TokenDataLoader (tokens JSON files)
      const tokenSymbols = await this.tokenDataLoader.getTokenSymbols(addresses, this.network);
      
      if (tokenSymbols.length > 0) {
        this.log(`Found ${tokenSymbols.length} token symbols from local token data`);
        
        // Save to database for future use
        for (const token of tokenSymbols) {
          await this.queryDB(`
            INSERT INTO tokens (token_address, network, symbol, name)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (token_address, network) 
            DO UPDATE SET 
              symbol = EXCLUDED.symbol,
              name = EXCLUDED.name
          `, [token.address.toLowerCase(), this.network, token.symbol, token.name]).catch(() => {});
        }
        
        return tokenSymbols;
      }
      
      // If not found in token data, try database
      const result = await this.queryDB(`
        SELECT token_address, symbol, name
        FROM tokens
        WHERE token_address = ANY($1)
        AND network = $2
      `, [addresses.map(a => a.toLowerCase()), this.network]);
      
      const dbTokens = [];
      const missingAddresses = [];
      
      // Check which addresses we have symbols for
      const foundAddresses = new Set(result.rows.map(r => r.token_address.toLowerCase()));
      
      for (const address of addresses) {
        const found = result.rows.find(r => r.token_address.toLowerCase() === address.toLowerCase());
        if (found && found.symbol) {
          dbTokens.push({
            address: address,
            symbol: found.symbol,
            name: found.name
          });
        } else {
          missingAddresses.push(address);
        }
      }
      
      // For missing addresses, try to get symbols from contract
      if (missingAddresses.length > 0 && this.web3) {
        this.log(`Fetching symbols for ${missingAddresses.length} tokens from blockchain...`);
        
        for (const address of missingAddresses) {
          try {
            const contract = new this.web3.eth.Contract([
              { constant: true, inputs: [], name: 'symbol', outputs: [{ name: '', type: 'string' }], type: 'function' },
              { constant: true, inputs: [], name: 'name', outputs: [{ name: '', type: 'string' }], type: 'function' }
            ], address);
            
            const [symbol, name] = await Promise.all([
              contract.methods.symbol().call().catch(() => null),
              contract.methods.name().call().catch(() => null)
            ]);
            
            if (symbol) {
              dbTokens.push({ address, symbol, name: name || symbol });
              
              // Save to database for future use
              await this.queryDB(`
                INSERT INTO tokens (token_address, network, symbol, name)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (token_address, network) 
                DO UPDATE SET 
                  symbol = EXCLUDED.symbol,
                  name = EXCLUDED.name
              `, [address.toLowerCase(), this.network, symbol, name || symbol]).catch(() => {});
            }
          } catch (error) {
            // Skip tokens we can't get symbols for
          }
        }
      }
      
      return dbTokens;
    } catch (error) {
      this.log(`Error fetching token symbols: ${error.message}`, 'warn');
      return [];
    }
  }

  async updateTokenPricesInDatabase(priceUpdates) {
    try {
      for (const update of priceUpdates) {
        await this.queryDB(`
          INSERT INTO tokens (token_address, network, price, price_updated, is_valid)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (token_address, network) 
          DO UPDATE SET 
            price = EXCLUDED.price,
            price_updated = EXCLUDED.price_updated,
            is_valid = EXCLUDED.is_valid
        `, [
          update.token_address,
          update.network, 
          update.price,
          update.price_updated,
          update.is_valid
        ]);
      }
      
      this.log(`📝 Updated ${priceUpdates.length} token prices in database`);
    } catch (error) {
      this.log(`Failed to update token prices in database: ${error.message}`, 'error');
    }
  }

  async getTokenAddressesFromDatabase() {
    try {
      const result = await this.queryDB(`
        SELECT token_address 
        FROM tokens 
        WHERE network = $1 AND is_valid = true 
        ORDER BY token_address
      `, [this.network]);
      
      const addresses = result.rows.map(row => row.token_address.toLowerCase());
      this.log(`📋 Found ${addresses.length} valid tokens for ${this.network}`);
      return addresses;
    } catch (error) {
      this.log(`Error fetching token addresses: ${error.message}`, 'warn');
      return []; // Return empty array as fallback
    }
  }

  async updateAddressFunds(addresses) {
    // Get token addresses from database (stored tokens)
    const tokenAddresses = await this.getTokenAddressesFromDatabase();
    await this.fetchTokenPrices(tokenAddresses);

    const processor = async (addressBatch) => {
      let nativeBalances = [];
      let erc20Balances = new Map();
      
      // Dynamic chunking with error handling for native balances
      try {
        const addressChunks = this.chunkAddresses(addressBatch);
        this.log(`Processing ${addressBatch.length} addresses in ${addressChunks.length} chunks (chunk size: ${this.currentBatchSize})`);
        
        for (const chunk of addressChunks) {
          try {
            this.log(`[DEBUG] Attempting batch balance call for ${chunk.length} addresses`);
            const chunkNativeBalances = await this.getNativeBalances(chunk);
            nativeBalances.push(...chunkNativeBalances);
            
            this.adjustBatchSize(true); // Success
            this.log(`[DEBUG] Batch balance call succeeded for ${chunk.length} addresses`);
            
          } catch (error) {
            this.log(`❌ Native balance batch failed for chunk of ${chunk.length}: ${error.message}`, 'warn');
            this.adjustBatchSize(false); // Failure
            
            // Fallback: try smaller chunks or individual calls
            for (const address of chunk) {
              try {
                const balance = await this.getNativeBalances([address]);
                nativeBalances.push(...balance);
              } catch (individualError) {
                this.log(`❌ Individual balance call failed for ${address}: ${individualError.message}`, 'warn');
                nativeBalances.push('0'); // Use 0 as fallback
              }
              await this.sleep(100); // Rate limiting for individual calls
            }
          }
          
          await this.sleep(200); // Rate limiting between chunks
        }
      } catch (error) {
        this.log(`❌ Critical error in native balance processing: ${error.message}`, 'error');
        // Fill with zeros as fallback
        nativeBalances = new Array(addressBatch.length).fill('0');
      }
      
      // ERC20 balances with similar error handling
      try {
        erc20Balances = await this.getERC20Balances(addressBatch, tokenAddresses);
      } catch (error) {
        this.log(`❌ ERC20 balance processing failed: ${error.message}`, 'warn');
        erc20Balances = new Map(); // Empty map as fallback
      }

      // Process each address
      const updates = addressBatch.map((address, index) => {
        const nativeBalance = nativeBalances[index]?.toString() || '0';
        const nativeCurrencyId = this.getNativeCurrencyId();
        const nativePrice = this.priceCache.get(nativeCurrencyId) || 0;
        const nativeValue = (parseFloat(nativeBalance) / 1e18) * nativePrice;

        let totalValue = nativeValue;
        const tokenBalances = {};

        // Strict validation: native value should be a valid number
        if (!validateFinancialValue(nativeValue)) {
          return null; // Skip this address
        }

        // Calculate token values
        const addressTokens = erc20Balances.get(address) || new Map();
        tokenAddresses.forEach(tokenAddr => {
          const balance = addressTokens.get(tokenAddr) || '0';
          const price = this.priceCache.get(tokenAddr) || 0;
          const value = (parseFloat(balance) / 1e18) * price;
          
          // Strict validation: token value should be a valid number
          if (validateFinancialValue(value, `token ${tokenAddr} for ${address}`, this)) {
            totalValue += value;
            if (parseFloat(balance) > 0) {
              tokenBalances[tokenAddr] = { balance, value };
            }
          }
        });

        // Final validation: total value should be reasonable
        if (!validateFinancialValue(totalValue, `total value for ${address}`, this)) {
          return null; // Skip this address
        }

        return {
          address: normalizeAddress(address),
          network: this.network,
          fund: Math.floor(totalValue),
          lastFundUpdated: this.currentTime
          // Remove tags field - preserve existing tags
        };
      });

      // Filter out null values (skipped addresses) and batch database updates
      const validUpdates = updates.filter(update => update !== null);
      if (validUpdates.length > 0) {
        await batchUpsertAddresses(this.db, validUpdates, { batchSize: 250 }); // Optimized for fund updates
      }

      const skippedCount = updates.length - validUpdates.length;
      if (skippedCount > 0) {
        this.log(`⚠️ Skipped ${skippedCount} addresses due to invalid fund data`);
      }

      return validUpdates.length;
    };

    return this.processBatch(addresses, processor, {
      batchSize: this.batchSizes.addresses,
      concurrency: 3,
      delayMs: 500
    });
  }

  async run() {
    this.log('🚀 Starting fund update process');

    this.log('📋 Getting outdated addresses...');
    const addresses = await this.getOutdatedAddresses();
    
    if (addresses.length === 0) {
      this.log('✅ No addresses need fund updates');
      return;
    }

    this.log(`📊 Found ${addresses.length} addresses requiring updates`);

    const results = await this.updateAddressFunds(addresses);
    const totalUpdated = results.reduce((sum, count) => sum + count, 0);
    
    this.log(`Updated ${totalUpdated} addresses successfully`);
  }
}

// Execute if run directly
if (require.main === module) {
  // Ensure process exits after completion
  process.env.AUTO_EXIT = 'true';
  
  const scanner = new FundUpdater();
  scanner.execute()
    .then(() => {
      console.log('✅ FundUpdater completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Scanner failed:', error);
      process.exit(1);
    });
}

module.exports = FundUpdater;
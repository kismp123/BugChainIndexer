/* eslint-disable no-console */
/**
 * Fund Updater Scanner
 * Updates asset prices and balances using Alchemy API
 */
const axios = require('axios');
const Scanner = require('../common/Scanner');
const fs = require('fs');
const path = require('path');
// Token addresses loaded from network config
const { batchUpsertAddresses, normalizeAddress } = require('../common');
const { CONFIG } = require('../config/networks.js');
const TokenPriceCache = require('../common/TokenPriceCache');
const TokenMetadataCache = require('../common/TokenMetadataCache');

class FundUpdater extends Scanner {
  constructor() {
    super('FundUpdater', {
      timeout: 7200,
      batchSizes: {
        addresses: 1000
      }
    });
    
    this.delayDays = CONFIG.FUNDUPDATEDELAY || 7;
    this.whitelistedTokens = null;
    this.priceCache = new TokenPriceCache();
    this.metadataCache = new TokenMetadataCache();
  }

  // Load whitelisted tokens from tokens folder
  loadWhitelistedTokens() {
    if (this.whitelistedTokens) return this.whitelistedTokens;
    
    try {
      const tokensFile = path.join(__dirname, '..', 'tokens', `${this.network}.json`);
      if (fs.existsSync(tokensFile)) {
        const tokens = JSON.parse(fs.readFileSync(tokensFile, 'utf8'));
        // Create a Set of token addresses for fast lookup (normalized to lowercase)
        this.whitelistedTokens = new Set(
          tokens.map(token => token.address.toLowerCase())
        );
        this.log(`📋 Loaded ${this.whitelistedTokens.size} whitelisted tokens for ${this.network}`);
        return this.whitelistedTokens;
      } else {
        this.log(`⚠️  No token whitelist found for ${this.network} at ${tokensFile}`);
        this.whitelistedTokens = new Set();
        return this.whitelistedTokens;
      }
    } catch (error) {
      this.log(`❌ Error loading token whitelist: ${error.message}`, 'error');
      this.whitelistedTokens = new Set();
      return this.whitelistedTokens;
    }
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
      AND (last_updated IS NOT NULL AND last_updated >= $3)
      AND code_hash IS NOT NULL 
      AND code_hash != $4
      AND code_hash != ''`;
      params.push(cutoffTime);        // $2: cutoff timestamp for last_fund_updated
      params.push(cutoffTime);        // $3: minimum timestamp for last_updated (7 days ago)
      params.push(this.ZERO_HASH);    // $4: zero hash to exclude
    }
    
    query += `
      AND (tags IS NULL OR NOT ('EOA' = ANY(tags)))`;
    
    // Add high fund filter if enabled
    if (highFundFlag) {
      const fundParamIndex = allFlag ? '$2' : '$5';
      const limitParamIndex = allFlag ? '$3' : '$6';
      
      query += ` AND fund >= ${fundParamIndex}`;
      params.push(minFund);
      query += ` ORDER BY fund DESC, last_fund_updated ASC NULLS FIRST LIMIT ${limitParamIndex}`;
      params.push(maxBatch);
      
      this.log(`🏛️ High fund mode enabled: targeting addresses with fund >= ${minFund.toLocaleString()}`);
    } else {
      const limitParamIndex = allFlag ? '$2' : '$5';
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

  // Get native token address for each network
  getNativeTokenAddress() {
    const nativeTokens = {
      'ethereum': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      'polygon': '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC
      'arbitrum': '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', // WETH on Arbitrum
      'optimism': '0x4200000000000000000000000000000000000006', // WETH on Optimism
      'base': '0x4200000000000000000000000000000000000006', // WETH on Base
      'binance': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
      'avalanche': '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // WAVAX
      'cronos': '0x5C7F8A570d578ED84E63fdFA7b1eE72dEae1AE23', // WCRO
      'fantom': '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83', // WFTM
      'moonbeam': '0xAcc15dC74880C9944775448304B263D191c6077F', // WGLMR
      'moonriver': '0x98878B06940aE243284CA214f92Bb71a2b032B8A', // WMOVR
      'gnosis': '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', // WXDAI
      'celo': '0x471EcE3750Da237f93B8E339c536989b8978a438', // CELO
      'linea': '0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f', // WETH on Linea
      'scroll': '0x5300000000000000000000000000000000000004', // WETH on Scroll
      'mantle': '0x78c1b0C915c4FAA5FffA6CAbf0219DA63d7f4cb8', // WMNT
      'opbnb': '0x4200000000000000000000000000000000000006' // WBNB on opBNB
    };
    return nativeTokens[this.network];
  }

  // Get native token symbol for each network
  getNativeSymbol() {
    const nativeSymbols = {
      'ethereum': 'ETH',
      'polygon': 'MATIC',
      'arbitrum': 'ETH',
      'optimism': 'ETH',
      'base': 'ETH',
      'binance': 'BNB',
      'avalanche': 'AVAX',
      'cronos': 'CRO',
      'fantom': 'FTM',
      'moonbeam': 'GLMR',
      'moonriver': 'MOVR',
      'gnosis': 'xDAI',
      'celo': 'CELO',
      'linea': 'ETH',
      'scroll': 'ETH',
      'mantle': 'MNT',
      'opbnb': 'BNB'
    };
    return nativeSymbols[this.network] || 'ETH';
  }

  // Fetch token prices using Alchemy Prices API
  async fetchTokenPrices(tokenAddresses) {
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey || !tokenAddresses || tokenAddresses.length === 0) {
      return {};
    }

    // Validate and normalize all token addresses
    const validAddresses = tokenAddresses
      .map(addr => normalizeAddress(addr))
      .filter(addr => addr !== null);

    if (validAddresses.length === 0) {
      this.log('⚠️  No valid token addresses to fetch prices for');
      return {};
    }

    try {
      // Use alchemyNetwork from networks.js config
      const networkConfig = CONFIG[this.network];
      if (!networkConfig || !networkConfig.alchemyNetwork) {
        return {};
      }
      const network = networkConfig.alchemyNetwork;

      // Use proxy if configured
      let baseUrl;
      if (process.env.USE_ALCHEMY_PROXY === 'true') {
        const proxyUrl = process.env.ALCHEMY_PROXY_URL || 'http://localhost:3002';
        baseUrl = `${proxyUrl}/v1/${apiKey}/prices/tokens/by-address`;
      } else {
        baseUrl = `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-address`;
      }

      // Prepare request for batch price fetching
      const requestBody = {
        addresses: validAddresses.map(addr => ({
          network: network,
          address: addr
        }))
      };

      const response = await axios.post(baseUrl, requestBody, {
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json'
        }
      });

      // Convert response to a map for easy lookup
      const priceMap = {};
      if (response.data && response.data.data) {
        response.data.data.forEach(item => {
          if (item.prices && item.prices.length > 0) {
            // Use the first price (usually USD) and convert to number
            priceMap[item.address.toLowerCase()] = parseFloat(item.prices[0].value);
          }
        });
      }

      return priceMap;
    } catch (error) {
      this.log(`⚠️  Error fetching token prices: ${error.message}`);
      return {};
    }
  }

  // Fetch portfolio data from Alchemy Data API (v1)
  async fetchPortfolioWithAlchemy(address) {
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) {
      this.log('⚠️  Alchemy API key not found');
      return null;
    }

    // Normalize and validate address before API call
    const normalizedAddress = normalizeAddress(address);
    if (!normalizedAddress) {
      this.log(`❌ Invalid address: ${address}`);
      return null;
    }

    try {
      // Use alchemyNetwork from networks.js config
      const networkConfig = CONFIG[this.network];
      if (!networkConfig || !networkConfig.alchemyNetwork) {
        this.log(`⚠️  Network ${this.network} not supported by Alchemy Data API`);
        return null;
      }
      const alchemyChain = networkConfig.alchemyNetwork;

      // Use Alchemy Data API v1 endpoint (API key is in the URL path)
      let dataApiUrl;
      if (process.env.USE_ALCHEMY_PROXY === 'true') {
        const proxyUrl = process.env.ALCHEMY_PROXY_URL || 'http://localhost:3002';
        dataApiUrl = `${proxyUrl}/data/v1/${apiKey}/assets/tokens/balances/by-address`;
      } else {
        dataApiUrl = `https://api.g.alchemy.com/data/v1/${apiKey}/assets/tokens/balances/by-address`;
      }

      // Get all token balances (native + ERC20) in one call
      const requestBody = {
        addresses: [
          {
            address: normalizedAddress,
            networks: [alchemyChain]
          }
        ],
        includeNativeTokens: true,
        includeErc20Tokens: true
      };

      this.log(`🔍 Fetching portfolio for ${normalizedAddress} on ${alchemyChain}`);
      
      const response = await axios.post(dataApiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'accept': 'application/json'
          // API key is already in the URL, not needed in headers
        },
        timeout: 30000
      });

      if (!response.data || !response.data.data || !response.data.data.tokens) {
        throw new Error('Invalid response from Alchemy Data API');
      }

      // Extract tokens from response
      const tokens = response.data.data.tokens;
      if (tokens.length === 0) {
        this.log(`⚠️  No tokens found for ${address} on ${alchemyChain}`);
        return {
          nativeBalance: '0',
          nativeUsdValue: 0,
          tokens: [],
          totalUsdValue: 0,
          source: 'alchemy'
        };
      }
      
      // Load whitelisted tokens
      const whitelist = this.loadWhitelistedTokens();
      
      // Process all tokens (native + ERC20)
      const validTokens = [];
      
      for (const token of tokens) {
        // Skip zero balances
        const balanceBigInt = BigInt(token.tokenBalance || '0x0');
        if (balanceBigInt === 0n) {
          continue;
        }

        // For ERC20 tokens, apply additional filters
        if (token.tokenAddress !== null) {
          const tokenAddr = token.tokenAddress.toLowerCase();

          // Skip if this token is the contract itself (self-token)
          if (tokenAddr === normalizedAddress) {
            this.log(`  ⏭️  Skipping self-token: ${tokenAddr}`);
            continue;
          }

          // Check whitelist if configured
          if (whitelist.size > 0 && !whitelist.has(tokenAddr)) {
            this.log(`  ⏭️  Skipping non-whitelisted token: ${tokenAddr}`);
            continue;
          }
        }
        
        validTokens.push(token);
      }

      // Get all token addresses for metadata and price fetching
      const tokenAddressesToFetch = validTokens
        .filter(t => t.tokenAddress !== null)
        .map(t => t.tokenAddress.toLowerCase());

      // Fetch token metadata with caching (30 day cache)
      let metadataMap = {};
      if (tokenAddressesToFetch.length > 0) {
        this.log(`📋 Fetching metadata for ${tokenAddressesToFetch.length} tokens...`);
        metadataMap = await this.metadataCache.fetchTokenMetadataWithCache(this.network, tokenAddressesToFetch);
        
        // Verify all tokens have metadata
        const missingMetadata = tokenAddressesToFetch.filter(addr => !metadataMap[addr]);
        if (missingMetadata.length > 0) {
          this.log(`⚠️  Missing metadata for ${missingMetadata.length} tokens, fetching again...`);
          // Force refresh for missing tokens
          const additionalMetadata = await this.metadataCache.fetchTokenMetadataWithCache(
            this.network, 
            missingMetadata, 
            true // force refresh
          );
          metadataMap = { ...metadataMap, ...additionalMetadata };
        }
      }

      // For native token price, use wrapped native token address
      const nativeTokenAddress = this.getNativeTokenAddress();
      const priceAddresses = [...tokenAddressesToFetch];
      if (nativeTokenAddress) {
        priceAddresses.push(nativeTokenAddress);
      }

      // Batch fetch all token prices with caching (7 day cache)
      let priceMap = {};
      if (priceAddresses.length > 0) {
        this.log(`💰 Fetching prices for ${priceAddresses.length} tokens...`);
        priceMap = await this.priceCache.fetchTokenPricesWithCache(this.network, priceAddresses);
        
        // Check for missing prices (not including native token wrapper)
        const missingPrices = tokenAddressesToFetch.filter(addr => 
          priceMap[addr] === undefined
        );
        
        if (missingPrices.length > 0) {
          this.log(`⚠️  Missing prices for ${missingPrices.length} tokens, attempting force refresh...`);
          // Try to force refresh prices for missing tokens
          const additionalPrices = await this.priceCache.fetchTokenPricesWithCache(
            this.network,
            missingPrices,
            true // force refresh
          );
          priceMap = { ...priceMap, ...additionalPrices };
        }
      }

      // Process all tokens (native + ERC20)
      const processedTokens = [];
      let totalUsdValue = 0;
      let nativeBalance = '0x0';
      let nativeUsdValue = 0;

      for (const tokenData of validTokens) {
        if (tokenData.tokenAddress === null) {
          // Native token
          nativeBalance = tokenData.tokenBalance;
          const balanceBigInt = BigInt(nativeBalance);
          const balanceFormatted = Number(balanceBigInt) / 1e18;
          
          // Get native price from wrapped token
          const nativePriceRaw = nativeTokenAddress ? (priceMap[nativeTokenAddress.toLowerCase()] || 0) : 0;
          const nativePrice = typeof nativePriceRaw === 'number' ? nativePriceRaw : parseFloat(nativePriceRaw);
          nativeUsdValue = balanceFormatted * nativePrice;
          totalUsdValue += nativeUsdValue;
          
          const nativeSymbol = this.getNativeSymbol();
          this.log(`  ${nativeSymbol}: ${balanceFormatted.toFixed(4)} ($${nativeUsdValue.toFixed(2)})`);
          continue;
        }
        
        // ERC20 token
        const tokenAddr = tokenData.tokenAddress.toLowerCase();
        
        // Get metadata from cache (must exist)
        const metadata = metadataMap[tokenAddr];
        if (!metadata || metadata.decimals === undefined) {
          this.log(`  ⚠️  No metadata for token ${tokenAddr}, skipping...`);
          continue;
        }
        
        const symbol = metadata.symbol || tokenAddr.slice(0, 6).toUpperCase();
        const name = metadata.name || metadata.symbol || 'Unknown Token';
        const decimals = metadata.decimals;
        
        // Calculate formatted balance
        const balanceBigInt = BigInt(tokenData.tokenBalance);
        const balanceFormatted = Number(balanceBigInt) / Math.pow(10, decimals);
        
        // Get price from cache/API
        const price = priceMap[tokenAddr];
        if (price === undefined) {
          this.log(`  ⚠️  No price data for ${symbol} (${tokenAddr}), setting to 0`);
          // If we couldn't get price data, set it to 0 but still include the token
          priceMap[tokenAddr] = 0;
        }
        
        const finalPrice = typeof priceMap[tokenAddr] === 'number' ? priceMap[tokenAddr] : parseFloat(priceMap[tokenAddr]);
        const usdValue = balanceFormatted * finalPrice;

        // Include all tokens with balance (even if price is 0)
        processedTokens.push({
          token_address: tokenAddr,
          symbol: symbol,
          name: name,
          decimals: decimals,
          balance: tokenData.tokenBalance,
          balance_formatted: balanceFormatted.toString(),
          usd_value: usdValue,
          usd_price: finalPrice
        });

        totalUsdValue += usdValue;
        
        // Log significant holdings
        if (usdValue > 100 || (price === 0 && balanceFormatted > 0.01)) {
          this.log(`  ${symbol}: ${balanceFormatted.toFixed(4)} ($${usdValue.toFixed(2)})`);
        }
      }

      this.log(`📊 Alchemy Summary: Native: $${nativeUsdValue.toFixed(2)}, Tokens: ${processedTokens.length}, Total: $${totalUsdValue.toFixed(2)}`);

      return {
        nativeBalance: nativeBalance,
        nativeUsdValue,
        tokens: processedTokens,
        totalUsdValue,
        source: 'alchemy'
      };
    } catch (error) {
      this.log(`⚠️  Alchemy Data API error for ${address}: ${error.message}`);
      if (error.response?.data) {
        this.log(`  Response: ${JSON.stringify(error.response.data)}`);
      }
      return null;
    }
  }

  // Use Alchemy API for balance fetching
  async updateAddressFunds(addresses) {
    this.log('🌐 Using Alchemy API for balance fetching');

    const processor = async (addressBatch) => {
      const updates = [];
      
      for (const addressObj of addressBatch) {
        const addressStr = addressObj.address || addressObj;
        try {
          // Try Alchemy API first
          const portfolio = await this.fetchPortfolioWithAlchemy(addressStr);
          
          if (portfolio && portfolio.totalUsdValue >= 0) {
            this.log(`✅ Alchemy: ${addressStr} = $${portfolio.totalUsdValue.toFixed(2)}`);
            
            updates.push({
              address: normalizeAddress(addressStr),
              network: this.network,
              fund: Math.floor(portfolio.totalUsdValue),
              lastFundUpdated: this.currentTime
            });
          } else {
            // Skip if Alchemy fails - will update later
            this.log(`⏸️  Alchemy failed for ${addressStr}, skipping for later update`);
          }
          
          // Rate limiting
          await this.sleep(100);
        } catch (error) {
          this.log(`❌ Error processing ${addressStr}: ${error.message}`, 'warn');
        }
      }

      // Batch database updates
      if (updates.length > 0) {
        await batchUpsertAddresses(this.db, updates, { batchSize: 250 });
      }

      return updates.length;
    };

    return this.processBatch(addresses, processor, {
      batchSize: 20, // Smaller batches for API calls
      concurrency: 2, // Less concurrency for API rate limits
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
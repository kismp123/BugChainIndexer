/* eslint-disable no-console */
/**
 * Fund Updater Scanner - Refactored
 * Updates asset prices and balances using Moralis API
 */
const axios = require('axios');
const Scanner = require('../common/Scanner');
const fs = require('fs');
const path = require('path');
// Token addresses loaded from network config
const { batchUpsertAddresses, normalizeAddress } = require('../common');
const CONFIG = require('../config/networks.js');

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

  // Fetch portfolio data from Moralis API (native + ERC20 in single call)
  async fetchPortfolioWithMoralis(address) {
    const apiKey = process.env.MORALIS_API_KEY;
    if (!apiKey) {
      this.log('⚠️  Moralis API key not found');
      return null;
    }

    try {
      // Map network names to Moralis chain names
      // Based on https://docs.moralis.com/supported-chains
      const chainMap = {
        'ethereum': 'eth',          // Ethereum (0x1)
        'binance': 'bsc',           // BNB Smart Chain (0x38)
        'polygon': 'polygon',       // Polygon (0x89)
        'avalanche': 'avalanche',   // Avalanche C-Chain (0xa86a)
        'arbitrum': 'arbitrum',     // Arbitrum One (0xa4b1)
        'optimism': 'optimism',     // Optimism (0xa)
        'base': 'base',             // Base (0x2105)
        'cronos': 'cronos',         // Cronos (0x19)
        'gnosis': 'gnosis',         // Gnosis (0x64)
        'linea': 'linea',           // Linea (0xe708)
        'moonbeam': 'moonbeam',     // Moonbeam (0x504)
        'moonriver': 'moonriver'    // Moonriver (0x505)
        // Not supported by Moralis: scroll, mantle, opbnb, celo
      };

      const moralisChain = chainMap[this.network];
      if (!moralisChain) {
        this.log(`⚠️  Network ${this.network} not supported by Moralis`);
        return null;
      }

      // Single API call to get both native and token balances with prices
      const response = await axios.get(
        `https://deep-index.moralis.io/api/v2.2/wallets/${address}/tokens`,
        {
          params: { 
            chain: moralisChain,
            limit: 50  // Can be increased up to 100 if needed
          },
          headers: { 
            'accept': 'application/json',
            'X-API-Key': apiKey 
          }
        }
      );

      const data = response.data.result || response.data || [];
      
      // Load whitelisted tokens for this network
      const whitelist = this.loadWhitelistedTokens();
      
      let nativeBalance = '0';
      let nativeUsdValue = 0;
      const tokens = [];
      let totalUsdValue = 0;
      let skippedTokens = 0;
      let skippedValue = 0;

      // Process each token (native currency is included as a token with native_token flag)
      data.forEach(token => {
        const usdValue = parseFloat(token.usd_value || 0);
        const tokenAddr = token.token_address?.toLowerCase();
        
        // Skip if this token is the contract itself (avoids double counting)
        // This happens when a token contract queries its own balance
        if (tokenAddr === address.toLowerCase()) {
          this.log(`  ⏭️  Skipping self-token to avoid inflation: ${token.symbol} ($${usdValue.toFixed(2)})`);
          return;
        }
        
        // Check if this is the native token (always include)
        if (token.native_token === true) {
          nativeBalance = token.balance || '0';
          nativeUsdValue = usdValue;
          totalUsdValue += usdValue;
        } 
        // For non-native tokens, check if they are whitelisted
        else if (whitelist.size === 0 || whitelist.has(tokenAddr)) {
          tokens.push(token);
          totalUsdValue += usdValue;
        } else {
          // Token not in whitelist, skip it
          skippedTokens++;
          skippedValue += usdValue;
          if (usdValue > 1000) { // Log significant skipped tokens
            this.log(`  ⏭️  Skipping non-whitelisted token: ${token.symbol} ($${usdValue.toFixed(2)})`);
          }
        }
      });
      
      if (skippedTokens > 0) {
        this.log(`  📝 Skipped ${skippedTokens} non-whitelisted tokens worth $${skippedValue.toFixed(2)}`);
      }

      this.log(`📊 Moralis: ${address} - Native: $${nativeUsdValue.toFixed(2)}, Tokens: ${tokens.length}, Total: $${totalUsdValue.toFixed(2)}`);

      return {
        nativeBalance,
        nativeUsdValue,
        tokens,
        totalUsdValue,
        source: 'moralis'
      };
    } catch (error) {
      this.log(`⚠️  Moralis API error for ${address}: ${error.message}`);
      return null;
    }
  }

  // Updated method to use Moralis API with RPC fallback
  async updateAddressFunds(addresses) {
    this.log('🌐 Using Moralis API for balance fetching');

    const processor = async (addressBatch) => {
      const updates = [];
      
      for (const addressObj of addressBatch) {
        const addressStr = addressObj.address || addressObj;
        try {
          // Try Moralis API first
          const portfolio = await this.fetchPortfolioWithMoralis(addressStr);
          
          if (portfolio && portfolio.totalUsdValue >= 0) {
            this.log(`✅ Moralis: ${addressStr} = $${portfolio.totalUsdValue.toFixed(2)}`);
            
            updates.push({
              address: normalizeAddress(addressStr),
              network: this.network,
              fund: Math.floor(portfolio.totalUsdValue),
              lastFundUpdated: this.currentTime
            });
          } else {
            // Skip if Moralis fails - will update later
            this.log(`⏸️  Moralis failed for ${addressStr}, skipping for later update`);
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
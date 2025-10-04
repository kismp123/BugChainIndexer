/* eslint-disable no-console */
/**
 * Fund Updater Scanner
 * Updates asset prices and balances using Alchemy API
 */
const Scanner = require('../common/Scanner');
const fs = require('fs');
const path = require('path');
// Token addresses loaded from network config
const { batchUpsertAddresses, normalizeAddress } = require('../common');
const { CONFIG } = require('../config/networks.js');
const TokenPriceCache = require('../common/TokenPriceCache');

class FundUpdater extends Scanner {
  constructor(network) {
    super('FundUpdater', {
      network,
      timeout: 7200,
      batchSizes: {
        addresses: 1000
      }
    });

    this.delayDays = CONFIG.FUNDUPDATEDELAY || 7;
    this.priceCache = new TokenPriceCache();

    // Dynamic batch sizing for balance calls (for BalanceHelper mode)
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

  // Load token addresses and symbol mapping from tokens/{network}.json file
  // Returns: { tokenAddresses: [], addressToSymbolMap: {}, addressToTokenMap: {} }
  loadTokenAddressMapping() {
    const tokensFilePath = path.join(__dirname, '..', 'tokens', `${this.network}.json`);
    let tokenAddresses = [];
    let addressToSymbolMap = {};
    let addressToTokenMap = {};

    try {
      const tokensData = JSON.parse(fs.readFileSync(tokensFilePath, 'utf8'));

      tokensData.forEach(token => {
        if (token.symbol && token.address) {
          const addressLower = token.address.toLowerCase();
          tokenAddresses.push(addressLower);
          addressToSymbolMap[addressLower] = token.symbol;
          addressToTokenMap[addressLower] = {
            symbol: token.symbol,
            name: token.name,
            address: token.address,
            decimals: token.decimals  // Use decimals from tokens file (no default)
          };
        }
      });

      this.log(`📋 Loaded ${tokenAddresses.length} token addresses from tokens/${this.network}.json`);
    } catch (error) {
      this.log(`⚠️  Failed to load tokens from file: ${error.message}`, 'warn');
      this.log('📋 Falling back to empty token list', 'warn');
    }

    return { tokenAddresses, addressToSymbolMap, addressToTokenMap };
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
      params.push(cutoffTime);        // $2: cutoff timestamp for last_fund_updated (7 days ago)
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


  // [REMOVED] Unused functions:
  // - getTokenAddressesFromDatabase() -> tokens loaded from tokens/{network}.json file
  // - fetchTokenPrices() -> prices fetched from symbol_prices table
  // - fetchPortfolioWithAlchemy() -> using BalanceHelper contract for batch processing

  /**
   * Fetch and update token prices using Alchemy Prices API (by symbol)
   * Also fetches decimals from alchemy_getTokenMetadata if not available
   */
  async updateTokenPrices() {
    // Use advisory lock to prevent concurrent symbol_prices updates across networks
    const lockId = 12345; // Fixed ID for symbol_prices table updates

    try {
      // Acquire advisory lock
      this.log('🔒 Acquiring lock for symbol_prices updates...');
      await this.queryDB('SELECT pg_advisory_lock($1)', [lockId]);
      this.log('✅ Lock acquired');

      // Load all tokens from tokens/{network}.json
      const { addressToSymbolMap, addressToTokenMap } = this.loadTokenAddressMapping();
      const allSymbols = [...new Set(Object.values(addressToSymbolMap))];

      if (allSymbols.length === 0) {
        this.log('⚠️ No symbols found in tokens file', 'warn');
        return;
      }

      // Filter symbols that need update (7 days old or never updated)
      const cutoffTime = this.currentTime - (this.delayDays * 24 * 60 * 60);
      const checkQuery = `
        SELECT symbol FROM symbol_prices
        WHERE LOWER(symbol) = ANY($1::text[])
        AND (last_updated IS NULL OR last_updated < $2)
      `;
      const symbolsLower = allSymbols.map(s => s.toLowerCase());
      const needUpdateResult = await this.queryDB(checkQuery, [symbolsLower, cutoffTime]);
      const symbolsNeedingUpdate = new Set(needUpdateResult.rows.map(r => r.symbol.toUpperCase()));

      // Filter to only symbols that need updating
      const symbolsToUpdate = allSymbols.filter(s => symbolsNeedingUpdate.has(s.toUpperCase()));

      if (symbolsToUpdate.length === 0) {
        this.log(`✅ All ${allSymbols.length} symbols are up-to-date (updated within ${this.delayDays} days)`);
        return;
      }

      this.log(`💰 Fetching prices for ${symbolsToUpdate.length}/${allSymbols.length} symbols from Alchemy Prices API (${allSymbols.length - symbolsToUpdate.length} already up-to-date)...`);

      // Fetch token prices from Alchemy API (max 25 symbols per call to avoid 400 errors)
      const batchSize = 25;
      let totalUpdated = 0;
      let tokensNeedingDecimals = [];

      for (let i = 0; i < symbolsToUpdate.length; i += batchSize) {
        const symbolBatch = symbolsToUpdate.slice(i, i + batchSize);

        try {
          const pricesResult = await this.alchemyClient.getTokenPricesBySymbol(symbolBatch);

          if (!pricesResult || !pricesResult.data) {
            this.log(`⚠️ No price data returned for batch ${Math.floor(i / batchSize) + 1}`, 'warn');
            continue;
          }

          // Update symbol_prices table with fetched prices
          const updateQuery = `
            INSERT INTO symbol_prices (symbol, price_usd, decimals, name, last_updated)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (symbol) DO UPDATE SET
              price_usd = EXCLUDED.price_usd,
              decimals = EXCLUDED.decimals,
              name = EXCLUDED.name,
              last_updated = EXCLUDED.last_updated
          `;

          for (const tokenData of pricesResult.data) {
            const symbol = tokenData.symbol;

            if (!symbol || !tokenData.prices || tokenData.prices.length === 0) {
              continue;
            }

            const priceUsd = tokenData.prices[0]?.value || 0;
            const name = tokenData.name || symbol;
            const decimals = tokenData.decimals || null;

            // If decimals is not available, mark for fetching via getTokenMetadata
            if (!decimals) {
              // Find token address from addressToTokenMap
              const tokenAddress = Object.keys(addressToSymbolMap).find(addr => addressToSymbolMap[addr] === symbol);
              if (tokenAddress) {
                tokensNeedingDecimals.push({ symbol, address: tokenAddress });
              }
            }

            await this.queryDB(updateQuery, [
              symbol,
              priceUsd,
              decimals || 18, // Default to 18 if not available
              name,
              this.currentTime
            ]);

            totalUpdated++;
          }

          this.log(`✅ Updated prices for batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(symbolsToUpdate.length / batchSize)} (${totalUpdated} symbols)`);
        } catch (error) {
          this.log(`❌ Failed to fetch prices for batch: ${error.message}`, 'warn');
        }

        // Rate limiting
        if (i + batchSize < symbolsToUpdate.length) {
          await this.sleep(300);
        }
      }

      // Fetch decimals for tokens that didn't have it
      if (tokensNeedingDecimals.length > 0) {
        this.log(`🔍 Fetching decimals for ${tokensNeedingDecimals.length} tokens via getTokenMetadata...`);

        for (const token of tokensNeedingDecimals) {
          try {
            const metadata = await this.alchemyClient.getTokenMetadata(token.address);

            if (metadata && metadata.decimals !== null && metadata.decimals !== undefined) {
              await this.queryDB(
                'UPDATE symbol_prices SET decimals = $1 WHERE symbol = $2',
                [metadata.decimals, token.symbol]
              );
              this.log(`  ✅ Updated decimals for ${token.symbol}: ${metadata.decimals}`);
            }
          } catch (error) {
            this.log(`  ⚠️ Failed to fetch metadata for ${token.symbol}: ${error.message}`, 'warn');
          }

          // Rate limiting
          await this.sleep(100);
        }
      }

      this.log(`✅ Updated ${totalUpdated}/${symbolsToUpdate.length} token prices from Alchemy Prices API`);
    } catch (error) {
      this.log(`❌ Failed to update token prices: ${error.message}`, 'error');
    } finally {
      // Always release the lock
      try {
        await this.queryDB('SELECT pg_advisory_unlock($1)', [lockId]);
        this.log('🔓 Lock released');
      } catch (unlockError) {
        this.log(`⚠️ Failed to release lock: ${unlockError.message}`, 'warn');
      }
    }
  }

  /**
   * Insert missing symbols from tokens folder into symbol_prices table
   * Uses placeholder price of 0 for tokens without price data
   */
  async insertMissingSymbols() {
    // Use advisory lock to prevent concurrent symbol_prices inserts across networks
    const lockId = 12346; // Different ID from updateTokenPrices for finer-grained locking

    try {
      // Acquire advisory lock
      this.log('🔒 Acquiring lock for symbol_prices inserts...');
      await this.queryDB('SELECT pg_advisory_lock($1)', [lockId]);
      this.log('✅ Lock acquired');

      // Load all tokens from tokens/{network}.json
      const { tokenAddresses, addressToSymbolMap } = this.loadTokenAddressMapping();
      const allSymbols = [...new Set(Object.values(addressToSymbolMap))];

      if (allSymbols.length === 0) {
        this.log('⚠️ No symbols found in tokens file', 'warn');
        return;
      }

      // Check which symbols are missing from symbol_prices
      const checkQuery = `
        SELECT LOWER(symbol) as symbol
        FROM symbol_prices
        WHERE LOWER(symbol) = ANY($1::text[])
      `;
      const symbolsLower = allSymbols.map(s => s.toLowerCase());
      const existingResult = await this.queryDB(checkQuery, [symbolsLower]);
      const existingSymbols = new Set(existingResult.rows.map(r => r.symbol));

      const missingSymbols = allSymbols.filter(s => !existingSymbols.has(s.toLowerCase()));

      if (missingSymbols.length === 0) {
        this.log('✅ All symbols already in symbol_prices');
        return;
      }

      this.log(`📝 Inserting ${missingSymbols.length} missing symbols into symbol_prices`);

      // Insert missing symbols with placeholder price 0
      const insertQuery = `
        INSERT INTO symbol_prices (symbol, price_usd, decimals, name, last_updated)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (symbol) DO NOTHING
      `;

      for (const symbol of missingSymbols) {
        await this.queryDB(insertQuery, [
          symbol,
          0, // Placeholder price - will be updated by updateTokenPrices()
          18, // Default decimals
          symbol, // Use symbol as name for now
          null // NULL until actual price is fetched
        ]);
      }

      this.log(`✅ Inserted ${missingSymbols.length} symbols (will fetch prices next)`);
    } catch (error) {
      this.log(`❌ Failed to insert missing symbols: ${error.message}`, 'error');
    } finally {
      // Always release the lock
      try {
        await this.queryDB('SELECT pg_advisory_unlock($1)', [lockId]);
        this.log('🔓 Lock released');
      } catch (unlockError) {
        this.log(`⚠️ Failed to release lock: ${unlockError.message}`, 'warn');
      }
    }
  }

  // Update address funds using BalanceHelper contract (batch method)
  async updateAddressFunds(addresses) {
    this.log('🔗 Using BalanceHelper contract for batch balance fetching');

    // Check if using Alchemy proxy (affects rate limiting)
    const useAlchemyProxy = process.env.USE_ALCHEMY_PROXY === 'true';
    if (useAlchemyProxy) {
      this.log('ℹ️  Using Alchemy proxy - rate limit delays disabled');
    }

    // Insert missing symbols before fetching prices
    await this.insertMissingSymbols();

    // Update token prices from Alchemy Prices API
    await this.updateTokenPrices();

    // Load token data from tokens/{network}.json file (includes decimals for each token)
    const { tokenAddresses, addressToSymbolMap, addressToTokenMap } = this.loadTokenAddressMapping();

    // Get unique symbols from loaded tokens
    const symbols = [...new Set(Object.values(addressToSymbolMap))];

    // Add native token symbol for the network
    const nativeSymbol = CONFIG[this.network]?.nativeCurrency;
    if (nativeSymbol && !symbols.includes(nativeSymbol)) {
      symbols.push(nativeSymbol);
    }

    this.log(`📋 Found ${symbols.length} symbols from tokens file (including native token)`);

    // Fetch symbol prices from symbol_prices table (price only, no decimals)
    const { symbols: validSymbols, symbolDataMap } = await this.priceCache.fetchTokenPrices(symbols);
    this.log(`💰 Loaded ${validSymbols.length}/${symbols.length} token prices`);

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
              // Rate limiting for individual calls (skip if using proxy)
              if (!useAlchemyProxy) {
                await this.sleep(100);
              }
            }
          }

          // Rate limiting between chunks (skip if using proxy)
          if (!useAlchemyProxy) {
            await this.sleep(200);
          }
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

      // Process each address using symbol-based data
      const updates = addressBatch.map((address, index) => {
        const nativeBalance = nativeBalances[index]?.toString() || '0';

        // Get native token price from symbol data
        const nativeSymbol = CONFIG[this.network]?.nativeCurrency || 'ETH';
        const nativeSymbolData = symbolDataMap.get(nativeSymbol.toLowerCase());
        const nativePrice = nativeSymbolData ? nativeSymbolData.price : 0;
        const nativeValue = (parseFloat(nativeBalance) / 1e18) * nativePrice;

        let totalValue = nativeValue;

        // Calculate token values using symbol-based data
        const addressTokens = erc20Balances.get(address) || new Map();
        tokenAddresses.forEach(tokenAddr => {
          const tokenData = addressTokens.get(tokenAddr) || { balance: '0' };
          const balance = parseFloat(tokenData.balance);

          // Get token metadata (includes decimals from tokens file)
          const tokenMetadata = addressToTokenMap[tokenAddr.toLowerCase()];
          if (!tokenMetadata || !tokenMetadata.decimals) {
            return; // Skip if no token metadata or decimals
          }

          // Get symbol for this address
          const symbol = tokenMetadata.symbol;
          if (!symbol) {
            return; // Skip if no symbol
          }

          // Get symbol data (price only, not decimals)
          const symbolData = symbolDataMap.get(symbol.toLowerCase());
          if (!symbolData) {
            return; // Skip if no symbol data (price)
          }

          const decimals = tokenMetadata.decimals;  // Use decimals from tokens file
          const price = symbolData.price;           // Use price from symbol_prices table
          const value = (balance / Math.pow(10, decimals)) * price;

          totalValue += value;
        });

        return {
          address: normalizeAddress(address),
          network: this.network,
          fund: Math.floor(totalValue),
          lastFundUpdated: this.currentTime
        };
      });

      // Batch database updates
      if (updates.length > 0) {
        await batchUpsertAddresses(this.db, updates, { batchSize: 250 });
      }

      return updates.length;
    };

    return this.processBatch(addresses, processor, {
      batchSize: this.batchSizes.addresses,
      concurrency: 3,
      delayMs: useAlchemyProxy ? 50 : 500  // Reduced delay when using proxy
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

  // Get network from command line args or environment
  const network = process.argv[2] || process.env.NETWORK || 'ethereum';

  const scanner = new FundUpdater(network);
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
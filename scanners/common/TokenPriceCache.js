/**
 * Token Price Cache Manager
 * Manages cached token prices in the database with 7-day expiration
 */

const { Pool } = require('pg');
const axios = require('axios');
const { CONFIG } = require('../config/networks');

class TokenPriceCache {
  constructor(dbConfig = null) {
    this.pool = new Pool(dbConfig || {
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      database: process.env.PGDATABASE || 'bugchain_indexer',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || ''
    });
    
    this.maxAgeHours = 168; // 7 days in hours
    this.batchSize = 50; // Max tokens to fetch in one API call
  }

  /**
   * Get cached token prices for multiple tokens
   * @param {string} network - Network name
   * @param {string[]} tokenAddresses - Array of token addresses
   * @returns {Object} Map of token address to price info
   */
  async getCachedPrices(network, tokenAddresses) {
    if (!tokenAddresses || tokenAddresses.length === 0) {
      return {};
    }

    try {
      const query = `
        SELECT 
          token_address,
          symbol,
          name,
          price_usd,
          last_updated
        FROM token_price_cache
        WHERE network = $1
        AND LOWER(token_address) = ANY($2::text[])
        AND last_updated > (CURRENT_TIMESTAMP - INTERVAL '${this.maxAgeHours} hours')
      `;

      const addresses = tokenAddresses.map(addr => addr.toLowerCase());
      const result = await this.pool.query(query, [network, addresses]);

      const priceMap = {};
      result.rows.forEach(row => {
        priceMap[row.token_address.toLowerCase()] = {
          price: parseFloat(row.price_usd),
          symbol: row.symbol,
          name: row.name,
          lastUpdated: row.last_updated,
          cached: true
        };
      });

      return priceMap;
    } catch (error) {
      console.error('Error fetching cached prices:', error);
      return {};
    }
  }

  /**
   * Update token prices in cache
   * @param {string} network - Network name
   * @param {Object[]} tokenPrices - Array of token price objects
   */
  async updatePrices(network, tokenPrices) {
    if (!tokenPrices || tokenPrices.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO token_price_cache (network, token_address, symbol, name, price_usd)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (network, token_address)
        DO UPDATE SET
          symbol = EXCLUDED.symbol,
          name = EXCLUDED.name,
          price_usd = EXCLUDED.price_usd,
          last_updated = CURRENT_TIMESTAMP
      `;

      for (const token of tokenPrices) {
        await client.query(query, [
          network,
          token.address.toLowerCase(),
          token.symbol || null,
          token.name || null,
          token.price
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating token prices:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Fetch token prices from Alchemy API with caching
   * @param {string} network - Network name
   * @param {string[]} tokenAddresses - Array of token addresses
   * @param {boolean} forceRefresh - Force refresh even if cached
   * @returns {Object} Map of token address to price
   */
  async fetchTokenPricesWithCache(network, tokenAddresses, forceRefresh = false) {
    if (!tokenAddresses || tokenAddresses.length === 0) {
      return {};
    }

    let priceMap = {};
    let addressesToFetch = [...tokenAddresses];

    // Get cached prices first (unless force refresh)
    if (!forceRefresh) {
      const cachedPrices = await this.getCachedPrices(network, tokenAddresses);
      priceMap = { ...cachedPrices };
      
      // Filter out addresses that already have cached prices
      addressesToFetch = tokenAddresses.filter(
        addr => !cachedPrices[addr.toLowerCase()]
      );

      if (addressesToFetch.length === 0) {
        console.log(`✅ All ${tokenAddresses.length} token prices loaded from cache`);
        return this.simplifyPriceMap(priceMap);
      }

      console.log(`📊 ${Object.keys(cachedPrices).length} prices from cache, fetching ${addressesToFetch.length} from API`);
    }

    // Fetch missing prices from Alchemy API
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) {
      console.warn('⚠️  Alchemy API key not found, returning cached prices only');
      return this.simplifyPriceMap(priceMap);
    }

    try {
      // Use alchemyNetwork from networks.js config
      const networkConfig = CONFIG[network];
      if (!networkConfig || !networkConfig.alchemyNetwork) {
        console.warn(`⚠️  Network ${network} not supported by Alchemy Prices API`);
        return this.simplifyPriceMap(priceMap);
      }
      const alchemyNetwork = networkConfig.alchemyNetwork;

      // Batch fetch prices (Alchemy supports up to 100 at once)
      const batches = [];
      for (let i = 0; i < addressesToFetch.length; i += this.batchSize) {
        batches.push(addressesToFetch.slice(i, i + this.batchSize));
      }

      const newPrices = [];

      for (const batch of batches) {
        let baseUrl;
        if (process.env.USE_ALCHEMY_PROXY === 'true') {
          const proxyUrl = process.env.ALCHEMY_PROXY_URL || 'http://localhost:3002';
          baseUrl = `${proxyUrl}/prices/v1/${apiKey}/tokens/by-address`;
        } else {
          baseUrl = `https://api.g.alchemy.com/prices/v1/${apiKey}/tokens/by-address`;
        }

        const requestBody = {
          addresses: batch.map(addr => ({
            network: alchemyNetwork,
            address: addr
          }))
        };

        const response = await axios.post(baseUrl, requestBody, {
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json'
          },
          timeout: 10000
        });

        if (response.data && response.data.data) {
          response.data.data.forEach(item => {
            if (item.prices && item.prices.length > 0) {
              const address = item.address.toLowerCase();
              const price = item.prices[0].value;
              
              priceMap[address] = {
                price: price,
                symbol: item.symbol,
                name: item.name,
                lastUpdated: new Date(),
                cached: false
              };

              newPrices.push({
                address: address,
                symbol: item.symbol,
                name: item.name,
                price: price
              });
            }
          });
        }
      }

      // Update cache with new prices
      if (newPrices.length > 0) {
        await this.updatePrices(network, newPrices);
        console.log(`💾 Cached ${newPrices.length} new token prices`);
      }

    } catch (error) {
      console.error('Error fetching token prices from API:', error.message);
    }

    return this.simplifyPriceMap(priceMap);
  }

  /**
   * Simplify price map to just address -> price
   * Returns object with price value or null if not found
   */
  simplifyPriceMap(priceMap) {
    const simplified = {};
    for (const [address, info] of Object.entries(priceMap)) {
      // Explicitly set price (can be 0 for legitimate zero-value tokens)
      simplified[address] = info.price;
    }
    return simplified;
  }

  /**
   * Clean up old cached prices
   * @param {number} daysToKeep - Number of days to keep prices (default 30)
   * @returns {number} Number of deleted records
   */
  async cleanupOldPrices(daysToKeep = 30) {
    try {
      const query = `
        DELETE FROM token_price_cache
        WHERE last_updated < (CURRENT_TIMESTAMP - INTERVAL '${daysToKeep} days')
        RETURNING *
      `;

      const result = await this.pool.query(query);
      console.log(`🗑️  Cleaned up ${result.rowCount} old token prices`);
      return result.rowCount;
    } catch (error) {
      console.error('Error cleaning up old prices:', error);
      return 0;
    }
  }

  /**
   * Get statistics about cached prices
   */
  async getCacheStats() {
    try {
      const query = `
        SELECT 
          network,
          COUNT(*) as token_count,
          MIN(last_updated) as oldest_price,
          MAX(last_updated) as newest_price,
          AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_updated)) / 3600)::NUMERIC(10,2) as avg_age_hours
        FROM token_price_cache
        GROUP BY network
        ORDER BY network
      `;

      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return [];
    }
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = TokenPriceCache;
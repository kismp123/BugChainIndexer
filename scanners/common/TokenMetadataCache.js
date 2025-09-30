/**
 * Token Metadata Cache Manager
 * Manages cached token metadata (symbol, name, decimals) in the database
 */

const { Pool } = require('pg');
const axios = require('axios');
const { CONFIG } = require('../config/networks');

class TokenMetadataCache {
  constructor(dbConfig = null) {
    this.pool = new Pool(dbConfig || {
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      database: process.env.PGDATABASE || 'bugchain_indexer',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || ''
    });
    
    this.maxAgedays = 30; // 30 days cache
    this.batchSize = 20; // Max tokens to fetch in one batch
  }

  /**
   * Get cached token metadata for multiple tokens
   * @param {string} network - Network name
   * @param {string[]} tokenAddresses - Array of token addresses
   * @returns {Object} Map of token address to metadata
   */
  async getCachedMetadata(network, tokenAddresses) {
    if (!tokenAddresses || tokenAddresses.length === 0) {
      return {};
    }

    try {
      const query = `
        SELECT 
          token_address,
          symbol,
          name,
          decimals,
          logo_url,
          last_updated
        FROM token_metadata_cache
        WHERE network = $1
        AND LOWER(token_address) = ANY($2::text[])
        AND last_updated > (CURRENT_TIMESTAMP - INTERVAL '${this.maxAgedays} days')
      `;

      const addresses = tokenAddresses.map(addr => addr.toLowerCase());
      const result = await this.pool.query(query, [network, addresses]);

      const metadataMap = {};
      result.rows.forEach(row => {
        metadataMap[row.token_address.toLowerCase()] = {
          symbol: row.symbol,
          name: row.name,
          decimals: row.decimals,
          logoUrl: row.logo_url,
          lastUpdated: row.last_updated,
          cached: true
        };
      });

      return metadataMap;
    } catch (error) {
      console.error('Error fetching cached metadata:', error);
      return {};
    }
  }

  /**
   * Update token metadata in cache
   * @param {string} network - Network name
   * @param {Object[]} tokenMetadata - Array of token metadata objects
   */
  async updateMetadata(network, tokenMetadata) {
    if (!tokenMetadata || tokenMetadata.length === 0) {
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const query = `
        INSERT INTO token_metadata_cache (network, token_address, symbol, name, decimals, logo_url)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (network, token_address)
        DO UPDATE SET
          symbol = EXCLUDED.symbol,
          name = EXCLUDED.name,
          decimals = EXCLUDED.decimals,
          logo_url = EXCLUDED.logo_url,
          last_updated = CURRENT_TIMESTAMP
      `;

      for (const token of tokenMetadata) {
        await client.query(query, [
          network,
          token.address.toLowerCase(),
          token.symbol || null,
          token.name || null,
          token.decimals || 18,
          token.logoUrl || null
        ]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating token metadata:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Fetch token metadata from Alchemy API with caching
   * @param {string} network - Network name
   * @param {string[]} tokenAddresses - Array of token addresses
   * @param {boolean} forceRefresh - Force refresh even if cached
   * @returns {Object} Map of token address to metadata
   */
  async fetchTokenMetadataWithCache(network, tokenAddresses, forceRefresh = false) {
    if (!tokenAddresses || tokenAddresses.length === 0) {
      return {};
    }

    let metadataMap = {};
    let addressesToFetch = [...tokenAddresses];

    // Get cached metadata first (unless force refresh)
    if (!forceRefresh) {
      const cachedMetadata = await this.getCachedMetadata(network, tokenAddresses);
      metadataMap = { ...cachedMetadata };
      
      // Filter out addresses that already have cached metadata
      addressesToFetch = tokenAddresses.filter(
        addr => !cachedMetadata[addr.toLowerCase()]
      );

      if (addressesToFetch.length === 0) {
        console.log(`✅ All ${tokenAddresses.length} token metadata loaded from cache`);
        return metadataMap;
      }

      console.log(`📊 ${Object.keys(cachedMetadata).length} metadata from cache, fetching ${addressesToFetch.length} from API`);
    }

    // Fetch missing metadata from Alchemy API
    const apiKey = process.env.ALCHEMY_API_KEY;
    if (!apiKey) {
      console.warn('⚠️  Alchemy API key not found, returning cached metadata only');
      return metadataMap;
    }

    try {
      // Get network config
      const networkConfig = CONFIG[network];
      if (!networkConfig || !networkConfig.alchemyNetwork) {
        console.warn(`⚠️  Network ${network} not supported by Alchemy API`);
        return metadataMap;
      }
      const alchemyNetwork = networkConfig.alchemyNetwork;

      // Set up RPC URL
      let rpcUrl;
      if (process.env.USE_ALCHEMY_PROXY === 'true') {
        const proxyUrl = process.env.ALCHEMY_PROXY_URL || 'http://localhost:3002';
        rpcUrl = `${proxyUrl}/v2/${alchemyNetwork}/${apiKey}`;
      } else {
        rpcUrl = `https://${alchemyNetwork}.g.alchemy.com/v2/${apiKey}`;
      }

      // Batch fetch metadata
      const batches = [];
      for (let i = 0; i < addressesToFetch.length; i += this.batchSize) {
        batches.push(addressesToFetch.slice(i, i + this.batchSize));
      }

      const newMetadata = [];

      for (const batch of batches) {
        // Create batch request
        const batchRequest = batch.map((addr, idx) => ({
          jsonrpc: '2.0',
          id: idx + 1,
          method: 'alchemy_getTokenMetadata',
          params: [addr]
        }));

        const response = await axios.post(rpcUrl, batchRequest, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });

        // Process responses
        if (Array.isArray(response.data)) {
          response.data.forEach((res, idx) => {
            if (res.result) {
              const address = batch[idx].toLowerCase();
              const metadata = res.result;
              
              metadataMap[address] = {
                symbol: metadata.symbol,
                name: metadata.name,
                decimals: metadata.decimals || 18,
                logoUrl: metadata.logo,
                cached: false
              };

              newMetadata.push({
                address: address,
                symbol: metadata.symbol,
                name: metadata.name,
                decimals: metadata.decimals || 18,
                logoUrl: metadata.logo
              });
            }
          });
        }
      }

      // Update cache with new metadata
      if (newMetadata.length > 0) {
        await this.updateMetadata(network, newMetadata);
        console.log(`💾 Cached ${newMetadata.length} new token metadata`);
      }

    } catch (error) {
      console.error('Error fetching token metadata from API:', error.message);
    }

    return metadataMap;
  }

  /**
   * Get statistics about cached metadata
   */
  async getCacheStats() {
    try {
      const query = `
        SELECT 
          network,
          COUNT(*) as token_count,
          MIN(last_updated) as oldest_metadata,
          MAX(last_updated) as newest_metadata,
          AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_updated)) / 86400)::NUMERIC(10,2) as avg_age_days
        FROM token_metadata_cache
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

module.exports = TokenMetadataCache;
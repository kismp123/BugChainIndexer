/**
 * Token Price Cache Manager
 * Manages cached token prices in the database with 7-day expiration
 */

const { Pool } = require('pg');
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
  }

  // [REMOVED] Unused functions that used token_price_cache table:
  // - getCachedPrices() - was for address-based caching
  // - updatePrices() - was for updating address-based cache

  /**
   * Fetch token prices for given symbols
   * @param {string[]} symbols - Array of token symbols
   * @returns {Object} { symbols: [], symbolDataMap: Map }
   */
  async fetchTokenPrices(symbols) {
    try {
      if (!symbols || symbols.length === 0) {
        console.log(`⚠️  No symbols provided`);
        return { symbols: [], symbolDataMap: new Map() };
      }

      // Get symbol data (price only) from symbol_prices table
      // Note: decimals come from tokens/{network}.json files, not from symbol_prices
      const symbolPricesQuery = `
        SELECT
          symbol,
          price_usd
        FROM symbol_prices
        WHERE LOWER(symbol) = ANY($1::text[])
      `;

      const uniqueSymbols = [...new Set(symbols.map(s => s.toLowerCase()))];
      const symbolPricesResult = await this.pool.query(symbolPricesQuery, [uniqueSymbols]);

      console.log(`💰 Loaded ${symbolPricesResult.rows.length}/${uniqueSymbols.length} token prices from symbol_prices table`);

      // Build symbolDataMap only for symbols with price data
      const symbolDataMap = new Map();
      const validSymbols = [];

      symbolPricesResult.rows.forEach(row => {
        const symbolLower = row.symbol.toLowerCase();
        symbolDataMap.set(symbolLower, {
          symbol: row.symbol,
          price: parseFloat(row.price_usd)
        });
        validSymbols.push(row.symbol);
      });

      const skippedCount = symbols.length - validSymbols.length;
      if (skippedCount > 0) {
        console.log(`⚠️  Skipped ${skippedCount} symbols (no price data)`);
      }

      return {
        symbols: validSymbols,
        symbolDataMap
      };

    } catch (error) {
      console.error(`Error fetching token prices:`, error.message);
      return { symbols: [], symbolDataMap: new Map() };
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
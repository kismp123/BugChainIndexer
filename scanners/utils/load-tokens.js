#!/usr/bin/env node

/**
 * Load token addresses from JSON files into database
 * Usage: node utils/load-tokens.js [network]
 */

const fs = require('fs');
const path = require('path');
const { initializeDB } = require('../common');
const { Pool } = require('pg');

class TokenLoader {
  constructor() {
    this.tokensDir = path.join(__dirname, '..', 'tokens');
    this.db = null;
  }

  async initialize() {
    console.log('🔄 Initializing token loader...');
    this.pool = new Pool();
    console.log('✅ Database connected');
  }

  async loadTokensForNetwork(network) {
    const filePath = path.join(this.tokensDir, `${network}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.log(`❌ Token file not found: ${filePath}`);
      return 0;
    }

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const tokens = data.tokens || [];
      
      console.log(`📄 Loading ${tokens.length} tokens for ${network}...`);
      
      let loaded = 0;
      
      for (const token of tokens) {
        try {
          // Normalize address
          const address = token.address.toLowerCase();
          
          // Extract symbol from name if possible
          let symbol = token.symbol;
          if (!symbol && token.name) {
            // Try to extract symbol from name (e.g., "USD Coin (USDC)" -> "USDC")
            const match = token.name.match(/\(([A-Z0-9]+)\)$/);
            symbol = match ? match[1] : token.name.split(' ')[0];
          }
          symbol = symbol || 'UNKNOWN';
          
          // Insert or update token
          await this.pool.query(`
            INSERT INTO tokens (token_address, network, symbol, name, decimals, is_valid)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (token_address, network) 
            DO UPDATE SET 
              symbol = EXCLUDED.symbol,
              name = EXCLUDED.name,
              decimals = EXCLUDED.decimals,
              is_valid = EXCLUDED.is_valid
          `, [
            address,
            network,
            symbol.substring(0, 20), // Limit symbol length
            token.name.substring(0, 255), // Limit name length  
            token.decimals || 18, // Default to 18 decimals
            true
          ]);
          
          loaded++;
          
        } catch (error) {
          console.log(`⚠️ Failed to load token ${token.address}: ${error.message}`);
        }
      }
      
      console.log(`✅ Loaded ${loaded} tokens for ${network}`);
      return loaded;
      
    } catch (error) {
      console.log(`❌ Error reading ${filePath}: ${error.message}`);
      return 0;
    }
  }

  async loadAllTokens() {
    console.log('🚀 Loading tokens for all networks...\n');
    
    const files = fs.readdirSync(this.tokensDir).filter(f => f.endsWith('.json'));
    let totalLoaded = 0;
    
    for (const file of files) {
      const network = path.basename(file, '.json');
      const loaded = await this.loadTokensForNetwork(network);
      totalLoaded += loaded;
      console.log('');
    }
    
    console.log(`🎉 Total tokens loaded: ${totalLoaded}`);
    return totalLoaded;
  }

  async showTokenStats() {
    console.log('\n📊 Token database statistics:');
    
    try {
      const result = await this.pool.query(`
        SELECT 
          network,
          COUNT(*) as total_tokens,
          COUNT(CASE WHEN price IS NOT NULL THEN 1 END) as tokens_with_price,
          MAX(price_updated) as last_price_update
        FROM tokens
        GROUP BY network
        ORDER BY network
      `);
      
      result.rows.forEach(row => {
        const lastUpdate = row.last_price_update ? 
          new Date(parseInt(row.last_price_update) * 1000).toISOString().split('T')[0] : 
          'Never';
        
        console.log(`  ${row.network}: ${row.total_tokens} tokens, ${row.tokens_with_price} with prices (last update: ${lastUpdate})`);
      });
      
    } catch (error) {
      console.log(`❌ Error getting stats: ${error.message}`);
    }
  }

  async cleanup() {
    if (this.pool) {
      await this.pool.end();
      console.log('\n🔒 Database connection closed');
    }
  }
}

async function main() {
  const loader = new TokenLoader();
  
  try {
    await loader.initialize();
    
    const network = process.argv[2];
    
    if (network) {
      console.log(`🎯 Loading tokens for ${network} network...\n`);
      await loader.loadTokensForNetwork(network);
    } else {
      await loader.loadAllTokens();
    }
    
    await loader.showTokenStats();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await loader.cleanup();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = TokenLoader;
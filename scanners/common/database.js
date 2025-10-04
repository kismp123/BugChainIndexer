/**
 * Database Operations and Schema Management
 * Unified database utilities and indexing
 */

// ====== SCHEMA MANAGEMENT ======
async function ensureSchema(client) {
  const schemas = [
    `CREATE TABLE IF NOT EXISTS addresses (
      address TEXT NOT NULL,
      code_hash TEXT,
      contract_name TEXT,
      deployed BIGINT,
      last_updated BIGINT,
      network TEXT NOT NULL,
      first_seen BIGINT,
      tags TEXT[] DEFAULT '{}',
      fund BIGINT DEFAULT 0,
      last_fund_updated BIGINT DEFAULT 0,
      name_checked BOOLEAN NOT NULL DEFAULT false,
      name_checked_at BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (address, network)
    )`,
    
    // Tokens table for price tracking
    `CREATE TABLE IF NOT EXISTS tokens (
      token_address TEXT NOT NULL,
      network TEXT NOT NULL,
      name TEXT,
      symbol TEXT,
      decimals INTEGER,
      price DECIMAL(20, 8),
      price_updated BIGINT,
      is_valid BOOLEAN DEFAULT true,
      PRIMARY KEY (token_address, network)
    )`,

    // Token metadata cache table (30 day cache for token metadata)
    `CREATE TABLE IF NOT EXISTS token_metadata_cache (
      network TEXT NOT NULL,
      token_address TEXT NOT NULL,
      symbol TEXT,
      name TEXT,
      decimals INTEGER,
      logo_url TEXT,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (network, token_address)
    )`,

    // Symbol prices table for token price data
    `CREATE TABLE IF NOT EXISTS symbol_prices (
      symbol VARCHAR(20) PRIMARY KEY,
      price_usd NUMERIC(20, 8) NOT NULL,
      decimals INTEGER DEFAULT 18,
      name VARCHAR(100),
      last_updated BIGINT
    )`,

    // Essential indexes for performance - optimized for common queries
    `CREATE INDEX IF NOT EXISTS idx_addresses_network ON addresses(network)`,
    `CREATE INDEX IF NOT EXISTS idx_addresses_tags_gin ON addresses USING GIN(tags)`,
    `CREATE INDEX IF NOT EXISTS idx_addresses_fund ON addresses(network, fund)`,
    `CREATE INDEX IF NOT EXISTS idx_addresses_last_updated ON addresses(network, last_updated)`,
    `CREATE INDEX IF NOT EXISTS idx_addresses_network_notags ON addresses(network) WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))`,
    `CREATE INDEX IF NOT EXISTS idx_tokens_network ON tokens(network)`,
    `CREATE INDEX IF NOT EXISTS idx_tokens_price_updated ON tokens(network, price_updated)`,
    `CREATE INDEX IF NOT EXISTS idx_token_metadata_cache_updated ON token_metadata_cache(network, last_updated)`,
    `CREATE INDEX IF NOT EXISTS idx_symbol_prices_symbol ON symbol_prices(LOWER(symbol))`
  ];

  for (const schema of schemas) {
    try {
      await client.query(schema);
    } catch (error) {
      console.error('Schema creation failed:', error.message);
    }
  }
  
  console.log('Database schema ensured');
}

// ====== BASIC OPERATIONS ======
async function upsertAddress(client, data) {
  const query = `
    INSERT INTO addresses (
      address, code_hash, contract_name, deployed,
      last_updated, network, first_seen, tags,
      fund, last_fund_updated, name_checked, name_checked_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (address, network) DO UPDATE SET
      code_hash = COALESCE($2, addresses.code_hash),
      contract_name = COALESCE($3, addresses.contract_name),
      deployed = COALESCE($4, addresses.deployed),
      last_updated = COALESCE($5, addresses.last_updated),
      first_seen = COALESCE($7, addresses.first_seen),
      tags = COALESCE($8, addresses.tags),
      fund = COALESCE($9, addresses.fund),
      last_fund_updated = COALESCE($10, addresses.last_fund_updated),
      name_checked = COALESCE($11, addresses.name_checked),
      name_checked_at = COALESCE($12, addresses.name_checked_at)
  `;
  
  const now = Math.floor(Date.now() / 1000);
  
  return client.query(query, [
    data.address,
    data.codeHash,
    data.contractName,
    // IMPORTANT: Keep deployed as null if not provided or invalid
    // Never use current time as default for deployed field
    (data.deployed && data.deployed > 0) ? data.deployed : null,
    data.lastUpdated || now,
    data.network,
    data.firstSeen || now,
    data.tags || [],
    data.fund || 0,
    data.lastFundUpdated || 0,
    data.nameChecked || false,
    data.nameCheckedAt || 0
  ]);
}

async function batchUpsertAddresses(client, addresses, options = {}) {
  if (addresses.length === 0) {
    return { rowCount: 0 };
  }

  const batchSize = options.batchSize || 500;
  const now = Math.floor(Date.now() / 1000);
  let totalRowCount = 0;
  
  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    
    const values = [];
    const params = [];
    let paramIndex = 1;
    
    for (const data of batch) {
      const rowParams = [
        data.address,
        data.codeHash || null,
        data.contractName || null,
        // IMPORTANT: Keep deployed as null if not provided or invalid
        // Never use current time as default for deployed field
        (data.deployed && data.deployed > 0) ? data.deployed : null,
        data.lastUpdated || now,
        data.network,
        data.firstSeen || now,
        data.tags || [],
        data.fund || 0,
        data.lastFundUpdated || 0,
        data.nameChecked || false,
        data.nameCheckedAt || 0
      ];
      
      const placeholders = rowParams.map(() => `$${paramIndex++}`).join(', ');
      values.push(`(${placeholders})`);
      params.push(...rowParams);
    }
    
    const query = `
      INSERT INTO addresses (
        address, code_hash, contract_name, deployed,
        last_updated, network, first_seen, tags,
        fund, last_fund_updated, name_checked, name_checked_at
      ) VALUES ${values.join(', ')}
      ON CONFLICT (address, network) DO UPDATE SET
        code_hash = COALESCE(EXCLUDED.code_hash, addresses.code_hash),
        contract_name = COALESCE(EXCLUDED.contract_name, addresses.contract_name),
        deployed = COALESCE(EXCLUDED.deployed, addresses.deployed),
        last_updated = COALESCE(EXCLUDED.last_updated, addresses.last_updated),
        first_seen = COALESCE(EXCLUDED.first_seen, addresses.first_seen),
        tags = COALESCE(EXCLUDED.tags, addresses.tags),
        fund = COALESCE(EXCLUDED.fund, addresses.fund),
        last_fund_updated = COALESCE(EXCLUDED.last_fund_updated, addresses.last_fund_updated),
        name_checked = COALESCE(EXCLUDED.name_checked, addresses.name_checked),
        name_checked_at = COALESCE(EXCLUDED.name_checked_at, addresses.name_checked_at)
    `;
    
    const result = await client.query(query, params);
    totalRowCount += result.rowCount;
  }
  
  return { rowCount: totalRowCount };
}

// ====== PERFORMANCE OPTIMIZATION ======

// Optimized batch upsert for high-volume data
async function optimizedBatchUpsert(client, addresses, options = {}) {
  if (addresses.length === 0) return { rowCount: 0 };

  const batchSize = options.batchSize || 1000; // Increased batch size
  const now = Math.floor(Date.now() / 1000);
  let totalRowCount = 0;
  
  // Use BEGIN/COMMIT for better performance
  await client.query('BEGIN');
  
  try {
    // Disable autocommit for batch operation
    await client.query('SET autocommit = off');
    
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      
      const values = [];
      const params = [];
      let paramIndex = 1;
      
      for (const data of batch) {
        const rowParams = [
          data.address,
          data.codeHash || null,
          data.contractName || null,
          data.deployed || null,
          data.lastUpdated || now,
          data.network,
          data.firstSeen || now,
          data.tags || [],
          data.fund || 0,
          data.lastFundUpdated || 0,
          data.nameChecked || false,
          data.nameCheckedAt || 0
        ];
        
        const placeholders = rowParams.map(() => `$${paramIndex++}`).join(',');
        values.push(`(${placeholders})`);
        params.push(...rowParams);
      }
      
      const query = `
        INSERT INTO addresses (
          address, code_hash, contract_name, deployed,
          last_updated, network, first_seen, tags,
          fund, last_fund_updated, name_checked, name_checked_at
        ) VALUES ${values.join(',')}
        ON CONFLICT (address, network) DO UPDATE SET
          code_hash = COALESCE(EXCLUDED.code_hash, addresses.code_hash),
          contract_name = COALESCE(EXCLUDED.contract_name, addresses.contract_name),
          deployed = COALESCE(EXCLUDED.deployed, addresses.deployed),
          last_updated = COALESCE(EXCLUDED.last_updated, addresses.last_updated),
          first_seen = COALESCE(EXCLUDED.first_seen, addresses.first_seen),
          tags = COALESCE(EXCLUDED.tags, addresses.tags),
          fund = COALESCE(EXCLUDED.fund, addresses.fund),
          last_fund_updated = COALESCE(EXCLUDED.last_fund_updated, addresses.last_fund_updated),
          name_checked = COALESCE(EXCLUDED.name_checked, addresses.name_checked),
          name_checked_at = COALESCE(EXCLUDED.name_checked_at, addresses.name_checked_at)
      `;
      
      const result = await client.query(query, params);
      totalRowCount += result.rowCount;
    }
    
    await client.query('COMMIT');
    return { rowCount: totalRowCount };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

// Database maintenance and optimization
async function optimizeDatabase(client, options = {}) {
  const { skipVacuum = false, verbose = true } = options;
  
  if (verbose) console.log('🔧 Starting database optimization...');
  
  try {
    // Quick statistics update (always safe and fast)
    await client.query('ANALYZE addresses');
    if (verbose) console.log('✅ Table statistics updated (fast)');
    
    if (!skipVacuum) {
      // Check if VACUUM is needed first
      const vacuumCheck = await client.query(`
        SELECT 
          schemaname, relname as tablename, n_dead_tup, n_live_tup,
          ROUND(n_dead_tup * 100.0 / GREATEST(n_live_tup + n_dead_tup, 1), 2) as dead_ratio
        FROM pg_stat_user_tables 
        WHERE relname = 'addresses'
      `);
      
      if (vacuumCheck.rows.length > 0) {
        const stats = vacuumCheck.rows[0];
        const deadRatio = parseFloat(stats.dead_ratio);
        
        if (verbose) {
          console.log(`📊 Table stats: ${stats.n_live_tup} live, ${stats.n_dead_tup} dead (${deadRatio}% dead)`);
        }
        
        if (deadRatio > 5) {  // Only vacuum if >5% dead tuples
          if (verbose) console.log('🧹 Running VACUUM (this may take several minutes)...');
          const startTime = Date.now();
          
          await client.query('VACUUM ANALYZE addresses');
          
          const duration = Math.round((Date.now() - startTime) / 1000);
          if (verbose) console.log(`✅ Table vacuumed and analyzed (${duration}s)`);
        } else {
          if (verbose) console.log('ℹ️  VACUUM skipped - table is clean (dead ratio < 5%)');
        }
      }
    } else {
      if (verbose) console.log('ℹ️  VACUUM skipped by option');
    }
    
    // Update query planner statistics (lightweight)
    await client.query("SELECT pg_stat_reset()");
    if (verbose) console.log('✅ Query statistics reset');
    
    return true;
  } catch (error) {
    console.error('❌ Database optimization failed:', error.message);
    return false;
  }
}

// Check query performance and suggest optimizations
async function analyzeQueryPerformance(client, sampleQueries = []) {
  console.log('📊 Analyzing query performance...');
  
  const defaultQueries = [
    // Common DataRevalidator query (optimized with parameterization)
    {
      sql: `EXPLAIN ANALYZE SELECT COUNT(*) FROM addresses WHERE network = $1 AND (tags IS NULL OR tags = '{}' OR NOT ('Contract' = ANY(tags)) AND NOT ('EOA' = ANY(tags)))`,
      params: ['ethereum'],
      description: 'DataRevalidator tag check query'
    },
    // Common FundUpdater query (optimized with parameterization)  
    {
      sql: `EXPLAIN ANALYZE SELECT COUNT(*) FROM addresses WHERE network = $1 AND (last_fund_updated IS NULL OR last_fund_updated < $2)`,
      params: ['ethereum', Math.floor(Date.now() / 1000) - 604800],
      description: 'FundUpdater staleness check query'
    },
    // Common UnifiedScanner query (optimized with parameterization)
    {
      sql: `EXPLAIN ANALYZE SELECT COUNT(*) FROM addresses WHERE network = $1 AND last_updated > $2`,
      params: ['ethereum', Math.floor(Date.now() / 1000) - 14400],
      description: 'UnifiedScanner recent activity query'
    }
  ];
  
  const queries = [...defaultQueries, ...sampleQueries];
  
  for (const query of queries) {
    try {
      // Handle both old string format and new object format
      const queryObj = typeof query === 'string' 
        ? { sql: query, params: [], description: 'Legacy query' }
        : query;
      
      console.log(`\n🔍 Query: ${queryObj.description || 'Analyzing query'}...`);
      const displaySql = queryObj.sql.replace('EXPLAIN ANALYZE ', '').substring(0, 100);
      console.log(`   ${displaySql}...`);
      
      const result = await client.query(queryObj.sql, queryObj.params || []);
      
      // Parse execution plan for slow operations
      const plan = result.rows.map(row => row['QUERY PLAN']).join('\n');
      
      if (plan.includes('Seq Scan')) {
        console.log('⚠️  Sequential scan detected - consider adding indexes');
      }
      
      const executionTime = plan.match(/Execution Time: ([\d.]+) ms/);
      if (executionTime && parseFloat(executionTime[1]) > 1000) {
        console.log(`🐌 Slow query detected: ${executionTime[1]}ms`);
      }
      
    } catch (error) {
      console.error(`❌ Query analysis failed: ${error.message}`);
    }
  }
}

async function ensureIndexesExist(client, options = {}) {
  const { verbose = false, skipOnError = true } = options;
  
  const results = {
    created: [],
    failed: [],
    skipped: []
  };
  
  for (const [tableName, indexes] of Object.entries(INDEXES)) {
    if (verbose) {
      console.log(`Ensuring indexes for table: ${tableName}`);
    }
    
    for (const index of indexes) {
      try {
        const startTime = Date.now();
        await client.query(index.sql);
        const duration = Date.now() - startTime;
        
        results.created.push({
          name: index.name,
          table: tableName,
          duration,
          description: index.description
        });
        
        if (verbose) {
          console.log(`✅ Index ${index.name} ensured in ${duration}ms`);
        }
      } catch (error) {
        const errorInfo = {
          name: index.name,
          table: tableName,
          error: error.message,
          description: index.description
        };
        
        if (skipOnError) {
          results.failed.push(errorInfo);
          if (verbose) {
            console.warn(`⚠️  Index ${index.name} failed: ${error.message}`);
          }
        } else {
          throw new Error(`Failed to create index ${index.name}: ${error.message}`);
        }
      }
    }
  }
  
  if (verbose) {
    console.log(`Index creation summary:`);
    console.log(`  Created/Verified: ${results.created.length}`);
    console.log(`  Failed: ${results.failed.length}`);
    console.log(`  Skipped: ${results.skipped.length}`);
  }
  
  return results;
}

async function getIndexStats(client, options = {}) {
  const { tableName = 'addresses', verbose = false } = options;
  
  try {
    // Get table size
    const tableSizeQuery = `
      SELECT 
        pg_size_pretty(pg_total_relation_size($1)) as table_size,
        pg_size_pretty(pg_relation_size($1)) as data_size,
        pg_size_pretty(pg_total_relation_size($1) - pg_relation_size($1)) as index_size
    `;
    
    const tableSizeResult = await client.query(tableSizeQuery, [tableName]);
    const sizes = tableSizeResult.rows[0];
    
    // Get index information
    const indexQuery = `
      SELECT 
        i.relname as index_name,
        pg_size_pretty(pg_relation_size(i.oid)) as index_size,
        idx_stat.idx_scan as scans,
        idx_stat.idx_tup_read as tuples_read,
        idx_stat.idx_tup_fetch as tuples_fetched,
        am.amname as method
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      LEFT JOIN pg_stat_user_indexes idx_stat ON idx_stat.indexrelid = i.oid
      LEFT JOIN pg_am am ON i.relam = am.oid
      WHERE t.relname = $1
      AND t.relkind = 'r'
      ORDER BY pg_relation_size(i.oid) DESC
    `;
    
    const indexResult = await client.query(indexQuery, [tableName]);
    
    const stats = {
      table: tableName,
      sizes,
      indexes: indexResult.rows,
      summary: {
        total_indexes: indexResult.rows.length,
        total_scans: indexResult.rows.reduce((sum, idx) => sum + (idx.scans || 0), 0),
        total_tuples_read: indexResult.rows.reduce((sum, idx) => sum + (idx.tuples_read || 0), 0)
      }
    };
    
    if (verbose) {
      console.log(`\nTable Statistics for ${tableName}:`);
      console.log(`  Total Size: ${sizes.table_size}`);
      console.log(`  Data Size: ${sizes.data_size}`);
      console.log(`  Index Size: ${sizes.index_size}`);
      console.log(`  Total Indexes: ${stats.summary.total_indexes}`);
      
      console.log(`\nIndex Details:`);
      stats.indexes.forEach(idx => {
        console.log(`  ${idx.index_name} (${idx.method}):`);
        console.log(`    Size: ${idx.index_size}`);
        console.log(`    Scans: ${idx.scans || 0}`);
        console.log(`    Tuples Read: ${idx.tuples_read || 0}`);
        console.log(`    Tuples Fetched: ${idx.tuples_fetched || 0}`);
        console.log('');
      });
    }
    
    return stats;
  } catch (error) {
    throw new Error(`Failed to get index stats for ${tableName}: ${error.message}`);
  }
}

// ====== QUERY HELPERS ======
async function findAddressesByNetwork(client, network, options = {}) {
  const {
    limit = 1000,
    offset = 0,
    deployed = null,
    nameChecked = null,
    orderBy = 'last_updated',
    orderDirection = 'DESC'
  } = options;
  
  let whereConditions = ['network = $1'];
  let params = [network];
  let paramIndex = 2;
  
  if (deployed !== null) {
    if (deployed === 'contract') {
      whereConditions.push(`deployed > 0`);
    } else if (deployed === 'eoa') {
      whereConditions.push(`deployed = 0`);
    }
  }
  
  if (nameChecked !== null) {
    whereConditions.push(`name_checked = $${paramIndex}`);
    params.push(nameChecked);
    paramIndex++;
  }
  
  const query = `
    SELECT * FROM addresses 
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY ${orderBy} ${orderDirection}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  
  params.push(limit, offset);
  
  const result = await client.query(query, params);
  return result.rows;
}

async function findAddressesNeedingVerification(client, network, options = {}) {
  const {
    limit = 100,
    minDeployTime = null,
    maxAge = 7 * 24 * 60 * 60 // 7 days in seconds
  } = options;
  
  const currentTime = Math.floor(Date.now() / 1000);
  const cutoffTime = currentTime - maxAge;
  
  let whereConditions = [
    'network = $1',
    'deployed > 0', // Only contracts
    'name_checked = false',
    `(name_checked_at = 0 OR name_checked_at < $2)` // Never checked or checked long ago
  ];
  
  let params = [network, cutoffTime];
  let paramIndex = 3;
  
  if (minDeployTime) {
    whereConditions.push(`deployed >= $${paramIndex}`);
    params.push(minDeployTime);
    paramIndex++;
  }
  
  const query = `
    SELECT address, deployed, name_checked_at, contract_name
    FROM addresses 
    WHERE ${whereConditions.join(' AND ')}
    ORDER BY deployed DESC
    LIMIT $${paramIndex}
  `;
  
  params.push(limit);
  
  const result = await client.query(query, params);
  return result.rows;
}

async function getNetworkStats(client, network) {
  const query = `
    SELECT 
      COUNT(*) as total_addresses,
      COUNT(*) FILTER (WHERE deployed > 0) as contracts,
      COUNT(*) FILTER (WHERE deployed = 0) as eoas,
      COUNT(*) FILTER (WHERE name_checked = true AND deployed > 0) as verified_contracts,
      COUNT(*) FILTER (WHERE contract_name IS NOT NULL) as named_contracts,
      MAX(last_updated) as latest_update,
      MIN(first_seen) as earliest_seen
    FROM addresses 
    WHERE network = $1
  `;
  
  const result = await client.query(query, [network]);
  const stats = result.rows[0];
  
  // Convert counts to numbers
  Object.keys(stats).forEach(key => {
    if (key !== 'latest_update' && key !== 'earliest_seen') {
      stats[key] = parseInt(stats[key]);
    }
  });
  
  return stats;
}

// ====== PREPARED STATEMENT HELPERS ======

/**
 * Prepared statement cache for frequently used queries
 */
class PreparedStatementManager {
  constructor() {
    this.statements = new Map();
    this.cache = new Map();
  }
  
  /**
   * Execute a prepared statement with caching
   * @param {object} client - Database client
   * @param {string} name - Statement name
   * @param {string} sql - SQL query with $1, $2, etc.
   * @param {array} params - Parameters for the query
   */
  async execute(client, name, sql, params = []) {
    // Use statement caching for better performance
    const cacheKey = `${name}_${sql}`;
    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, { sql, lastUsed: Date.now() });
    }
    
    this.cache.get(cacheKey).lastUsed = Date.now();
    
    return client.query(sql, params);
  }
  
  /**
   * Clean up old cached statements (call periodically)
   */
  cleanup(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.lastUsed > maxAge) {
        this.cache.delete(key);
      }
    }
  }
}

// Global prepared statement manager
const preparedStatements = new PreparedStatementManager();

/**
 * Common prepared statements for frequently used queries
 */
const PREPARED_QUERIES = {
  // DataRevalidator queries
  GET_ADDRESSES_NEEDING_REVALIDATION: `
    SELECT address, network, deployed, code_hash, contract_name, tags
    FROM addresses 
    WHERE network = $1 
    AND (tags IS NULL OR tags = '{}' OR NOT ('Contract' = ANY(tags)) AND NOT ('EOA' = ANY(tags)))
    ORDER BY last_updated ASC NULLS FIRST
    LIMIT $2
  `,
  
  // FundUpdater queries  
  GET_ADDRESSES_NEEDING_FUND_UPDATE: `
    SELECT address FROM addresses
    WHERE (last_fund_updated IS NULL OR last_fund_updated < $1)
    AND network = $2
    AND code_hash IS NOT NULL 
    AND code_hash != $3
    AND code_hash != ''
    AND (tags IS NULL OR NOT ('EOA' = ANY(tags)))
    ORDER BY last_fund_updated ASC NULLS FIRST
    LIMIT $4
  `,
  
  // UnifiedScanner queries
  CHECK_EXISTING_ADDRESSES: `
    SELECT address FROM addresses 
    WHERE address = ANY($1) AND network = $2
  `,
  
  // Performance test queries
  COUNT_ADDRESSES_BY_NETWORK: `
    SELECT COUNT(*) FROM addresses WHERE network = $1
  `,
  
  COUNT_CONTRACTS_BY_NETWORK: `
    SELECT COUNT(*) FROM addresses 
    WHERE network = $1 AND 'Contract' = ANY(tags)
  `
};

/**
 * Execute a prepared query with performance optimization
 * @param {object} client - Database client  
 * @param {string} queryName - Name from PREPARED_QUERIES
 * @param {array} params - Query parameters
 */
async function executePreparedQuery(client, queryName, params = []) {
  if (!PREPARED_QUERIES[queryName]) {
    throw new Error(`Unknown prepared query: ${queryName}`);
  }
  
  return preparedStatements.execute(
    client, 
    queryName, 
    PREPARED_QUERIES[queryName], 
    params
  );
}

// ====== TOKEN MANAGEMENT ======
async function loadTokensFromFile(client, network) {
  const fs = require('fs');
  const path = require('path');
  
  const tokensDir = path.join(__dirname, '..', 'tokens');
  const filePath = path.join(tokensDir, `${network}.json`);
  
  if (!fs.existsSync(filePath)) {
    return 0; // No token file for this network
  }

  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const tokens = data.tokens || [];
    
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
        await client.query(`
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
        // Skip individual token errors silently
        console.log(`⚠️ Failed to load token ${token.address}: ${error.message}`);
      }
    }
    
    return loaded;
    
  } catch (error) {
    console.log(`❌ Error reading tokens for ${network}: ${error.message}`);
    return 0;
  }
}

async function getTokenStats(client, network = null) {
  try {
    let query = `
      SELECT 
        network,
        COUNT(*) as total_tokens,
        COUNT(CASE WHEN price IS NOT NULL THEN 1 END) as tokens_with_price,
        MAX(price_updated) as last_price_update
      FROM tokens
    `;
    
    const params = [];
    if (network) {
      query += ` WHERE network = $1`;
      params.push(network);
    }
    
    query += ` GROUP BY network ORDER BY network`;
    
    const result = await client.query(query, params);
    return result.rows;
    
  } catch (error) {
    console.log(`❌ Error getting token stats: ${error.message}`);
    return [];
  }
}

// ====== EXPORTS ======
module.exports = {
  // Schema management
  ensureSchema,
  
  // Basic operations
  batchUpsertAddresses,
  optimizedBatchUpsert,
  
  // Index management
  ensureIndexesExist,
  getIndexStats,
  
  // Performance optimization
  optimizeDatabase,
  analyzeQueryPerformance,
  
  // Prepared statements
  PreparedStatementManager,
  PREPARED_QUERIES,
  executePreparedQuery,
  preparedStatements,
  
  // Token management
  loadTokensFromFile,
  getTokenStats
};

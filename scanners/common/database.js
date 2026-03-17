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
      symbol VARCHAR(50) PRIMARY KEY,
      price_usd NUMERIC(20, 8) NOT NULL,
      decimals INTEGER DEFAULT 18,
      name VARCHAR(100),
      last_updated BIGINT
    )`,

    // Network log density statistics for dynamic optimization
    `CREATE TABLE IF NOT EXISTS network_log_density_stats (
      network VARCHAR(50) PRIMARY KEY,
      avg_logs_per_block DECIMAL(10, 2) NOT NULL,
      stddev_logs_per_block DECIMAL(10, 2),
      min_logs_per_block INTEGER,
      max_logs_per_block INTEGER,
      optimal_batch_size INTEGER,
      recommended_profile VARCHAR(50),
      sample_count INTEGER NOT NULL DEFAULT 0,
      total_logs_sampled BIGINT NOT NULL DEFAULT 0,
      total_blocks_sampled BIGINT NOT NULL DEFAULT 0,
      last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,

    // Approvals table for ERC20 Approval event tracking
    `CREATE TABLE IF NOT EXISTS approvals (
      owner TEXT NOT NULL,
      spender TEXT NOT NULL,
      token_address TEXT NOT NULL,
      value TEXT NOT NULL,
      block_number BIGINT NOT NULL,
      tx_hash TEXT NOT NULL,
      log_index INTEGER NOT NULL,
      network TEXT NOT NULL,
      first_seen BIGINT NOT NULL,
      last_updated BIGINT NOT NULL,
      PRIMARY KEY (owner, spender, token_address, network)
    )`,

    // Approvals indexes
    `CREATE INDEX IF NOT EXISTS idx_approvals_spender ON approvals(spender, network)`,
    `CREATE INDEX IF NOT EXISTS idx_approvals_network ON approvals(network)`,
    `CREATE INDEX IF NOT EXISTS idx_approvals_block ON approvals(network, block_number DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_approvals_token ON approvals(token_address, network)`,

    // Essential indexes for performance - optimized for common queries
    `CREATE INDEX IF NOT EXISTS idx_addresses_network ON addresses(network)`,
    `CREATE INDEX IF NOT EXISTS idx_addresses_tags_gin ON addresses USING GIN(tags)`,
    `CREATE INDEX IF NOT EXISTS idx_addresses_fund ON addresses(network, fund)`,
    `CREATE INDEX IF NOT EXISTS idx_addresses_last_updated ON addresses(network, last_updated)`,
    `CREATE INDEX IF NOT EXISTS idx_addresses_first_seen ON addresses(network, first_seen DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_addresses_first_seen_global ON addresses(first_seen DESC NULLS LAST) WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))`,
    `CREATE INDEX IF NOT EXISTS idx_addresses_network_notags ON addresses(network) WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))`,
    `CREATE INDEX IF NOT EXISTS idx_tokens_network ON tokens(network)`,
    `CREATE INDEX IF NOT EXISTS idx_tokens_price_updated ON tokens(network, price_updated)`,
    `CREATE INDEX IF NOT EXISTS idx_token_metadata_cache_updated ON token_metadata_cache(network, last_updated)`,
    `CREATE INDEX IF NOT EXISTS idx_symbol_prices_symbol ON symbol_prices(LOWER(symbol))`,
    `CREATE INDEX IF NOT EXISTS idx_log_density_stats_updated ON network_log_density_stats(last_updated DESC)`
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
        code_hash = CASE
          WHEN EXCLUDED.code_hash IS NOT NULL THEN EXCLUDED.code_hash
          ELSE addresses.code_hash
        END,
        contract_name = CASE
          WHEN EXCLUDED.contract_name IS NOT NULL THEN EXCLUDED.contract_name
          ELSE addresses.contract_name
        END,
        deployed = CASE
          WHEN EXCLUDED.deployed IS NOT NULL THEN EXCLUDED.deployed
          ELSE addresses.deployed
        END,
        last_updated = EXCLUDED.last_updated,
        first_seen = COALESCE(addresses.first_seen, EXCLUDED.first_seen),
        tags = CASE
          WHEN EXCLUDED.tags IS NOT NULL AND array_length(EXCLUDED.tags, 1) > 0
          THEN EXCLUDED.tags
          ELSE addresses.tags
        END,
        fund = EXCLUDED.fund,
        last_fund_updated = EXCLUDED.last_fund_updated,
        name_checked = EXCLUDED.name_checked,
        name_checked_at = EXCLUDED.name_checked_at
    `;

    const result = await client.query(query, params);
    totalRowCount += result.rowCount;
  }

  return { rowCount: totalRowCount };
}

// ====== PERFORMANCE OPTIMIZATION ======

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
    {
      sql: `EXPLAIN ANALYZE SELECT COUNT(*) FROM addresses WHERE network = $1 AND (tags IS NULL OR tags = '{}' OR NOT ('Contract' = ANY(tags)) AND NOT ('EOA' = ANY(tags)))`,
      params: ['ethereum'],
      description: 'DataRevalidator tag check query'
    },
    {
      sql: `EXPLAIN ANALYZE SELECT COUNT(*) FROM addresses WHERE network = $1 AND (last_fund_updated IS NULL OR last_fund_updated < $2)`,
      params: ['ethereum', Math.floor(Date.now() / 1000) - 604800],
      description: 'FundUpdater staleness check query'
    },
    {
      sql: `EXPLAIN ANALYZE SELECT COUNT(*) FROM addresses WHERE network = $1 AND last_updated > $2`,
      params: ['ethereum', Math.floor(Date.now() / 1000) - 14400],
      description: 'UnifiedScanner recent activity query'
    }
  ];

  const queries = [...defaultQueries, ...sampleQueries];

  for (const query of queries) {
    try {
      const queryObj = typeof query === 'string'
        ? { sql: query, params: [], description: 'Legacy query' }
        : query;

      console.log(`\n🔍 Query: ${queryObj.description || 'Analyzing query'}...`);
      const displaySql = queryObj.sql.replace('EXPLAIN ANALYZE ', '').substring(0, 100);
      console.log(`   ${displaySql}...`);

      const result = await client.query(queryObj.sql, queryObj.params || []);

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

async function getIndexStats(client, options = {}) {
  const { tableName = 'addresses', verbose = false } = options;

  try {
    const tableSizeQuery = `
      SELECT
        pg_size_pretty(pg_total_relation_size($1)) as table_size,
        pg_size_pretty(pg_relation_size($1)) as data_size,
        pg_size_pretty(pg_total_relation_size($1) - pg_relation_size($1)) as index_size
    `;

    const tableSizeResult = await client.query(tableSizeQuery, [tableName]);
    const sizes = tableSizeResult.rows[0];

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

// ====== APPROVAL OPERATIONS ======
async function batchUpsertApprovals(client, approvals, options = {}) {
  if (approvals.length === 0) {
    return { rowCount: 0 };
  }

  // Deduplicate by PK (owner, spender, token_address, network), keep latest block_number
  const deduped = new Map();
  for (const a of approvals) {
    const key = `${a.owner}|${a.spender}|${a.tokenAddress}|${a.network}`;
    const existing = deduped.get(key);
    if (!existing || a.blockNumber > existing.blockNumber) {
      deduped.set(key, a);
    }
  }
  const uniqueApprovals = Array.from(deduped.values());

  const batchSize = options.batchSize || 500;
  const now = Math.floor(Date.now() / 1000);
  let totalRowCount = 0;

  for (let i = 0; i < uniqueApprovals.length; i += batchSize) {
    const batch = uniqueApprovals.slice(i, i + batchSize);

    const values = [];
    const params = [];
    let paramIndex = 1;

    for (const data of batch) {
      const rowParams = [
        data.owner,
        data.spender,
        data.tokenAddress,
        data.value || '0',
        data.blockNumber,
        data.txHash,
        data.logIndex,
        data.network,
        data.firstSeen || now,
        data.lastUpdated || now
      ];

      const placeholders = rowParams.map(() => `$${paramIndex++}`).join(', ');
      values.push(`(${placeholders})`);
      params.push(...rowParams);
    }

    const query = `
      INSERT INTO approvals (
        owner, spender, token_address, value,
        block_number, tx_hash, log_index, network,
        first_seen, last_updated
      ) VALUES ${values.join(', ')}
      ON CONFLICT (owner, spender, token_address, network) DO UPDATE SET
        value = EXCLUDED.value,
        block_number = EXCLUDED.block_number,
        tx_hash = EXCLUDED.tx_hash,
        log_index = EXCLUDED.log_index,
        last_updated = EXCLUDED.last_updated
    `;

    const result = await client.query(query, params);
    totalRowCount += result.rowCount;
  }

  return { rowCount: totalRowCount };
}

// ====== EXPORTS ======
module.exports = {
  ensureSchema,
  batchUpsertAddresses,
  optimizeDatabase,
  analyzeQueryPerformance,
  getIndexStats,
  batchUpsertApprovals
};

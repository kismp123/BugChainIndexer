#!/usr/bin/env node
/**
 * Database Optimization Script
 * Creates essential indexes and performs maintenance for backend API performance
 */

const { Pool } = require('pg');

class DatabaseOptimizer {
  constructor() {
    this.db = null;
    this.pool = null;
  }

  async initialize() {
    console.log('🔗 Connecting to database...');
    
    this.pool = new Pool({
      user: process.env.PGUSER || 'postgres',
      host: process.env.PGHOST || 'localhost',
      database: process.env.PGDATABASE || 'bugchain_indexer',
      password: process.env.PGPASSWORD || '',
      port: Number(process.env.PGPORT || 5432),
      max: 3,
      connectionTimeoutMillis: 15000,
    });
    
    this.db = await this.pool.connect();
    console.log('✅ Database connected');
  }

  async createAdvancedIndexes() {
    console.log('🔧 Creating optimized indexes...');

    const advancedIndexes = [
      // ===== Backend API Indexes (Critical for user-facing queries) =====
      {
        name: 'idx_addresses_api_sort_optimal',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_api_sort_optimal
              ON addresses(fund DESC NULLS LAST, deployed DESC NULLS LAST, address ASC)
              WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))`,
        description: '🔥 Backend API sorting optimization (fund, deployed, address)'
      },
      {
        name: 'idx_addresses_address_prefix',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_address_prefix
              ON addresses(address text_pattern_ops)
              WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))`,
        description: 'Backend API address prefix search (LIKE "0xabc%")'
      },

      // ===== Scanner Indexes =====
      {
        name: 'idx_addresses_composite_revalidation',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_composite_revalidation
              ON addresses(network, last_updated)
              WHERE (tags IS NULL OR tags = '{}' OR ARRAY_LENGTH(tags, 1) IS NULL OR
                     (tags IS NOT NULL AND NOT ('Contract' = ANY(tags)) AND NOT ('EOA' = ANY(tags))))`,
        description: 'Scanner: DataRevalidator with last_updated ordering'
      },
      {
        name: 'idx_addresses_fund_epoch_based',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_fund_epoch_based
              ON addresses(network, last_fund_updated)
              WHERE (last_fund_updated IS NULL OR last_fund_updated < 1736380800)`,
        description: 'Scanner: FundUpdater epoch-based partial index'
      },
      {
        name: 'idx_addresses_recent_activity',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_recent_activity
              ON addresses(network, last_updated DESC)
              WHERE last_updated > 1736000000`,
        description: 'Scanner: UnifiedScanner recent activity'
      },
      {
        name: 'idx_addresses_network_hash_deployed',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_network_hash_deployed
              ON addresses(network, code_hash, deployed)
              WHERE code_hash IS NOT NULL AND code_hash != '' AND code_hash != '0x0000000000000000000000000000000000000000000000000000000000000000'`,
        description: 'Scanner: Contract queries'
      }
    ];

    let createdCount = 0;
    for (const index of advancedIndexes) {
      try {
        console.log(`  Creating ${index.name}...`);
        const startTime = Date.now();
        await this.db.query(index.sql);
        const duration = Date.now() - startTime;
        console.log(`  ✅ Created ${index.name} (${duration}ms) - ${index.description}`);
        createdCount++;
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`  ℹ️  Index ${index.name} already exists`);
          createdCount++;
        } else {
          console.log(`  ❌ Failed to create ${index.name}: ${error.message}`);
        }
      }
    }
    
    console.log(`Created/verified ${createdCount}/${advancedIndexes.length} advanced indexes`);
  }



  async performMaintenance() {
    console.log('🔧 Performing database maintenance...');

    try {
      // Check if VACUUM is needed
      const vacuumCheck = await this.db.query(`
        SELECT
          n_dead_tup, n_live_tup,
          ROUND(n_dead_tup * 100.0 / GREATEST(n_live_tup + n_dead_tup, 1), 2) as dead_ratio
        FROM pg_stat_user_tables
        WHERE relname = 'addresses'
      `);

      if (vacuumCheck.rows.length > 0) {
        const stats = vacuumCheck.rows[0];
        const deadRatio = parseFloat(stats.dead_ratio);

        console.log(`📊 Dead tuple ratio: ${deadRatio}%`);

        if (deadRatio > 5) {
          console.log('🧹 Running VACUUM (this may take several minutes)...');
          const startTime = Date.now();

          await this.db.query('VACUUM ANALYZE addresses');

          const duration = Math.round((Date.now() - startTime) / 1000);
          console.log(`✅ VACUUM completed (${duration}s)`);
        } else {
          console.log('ℹ️  VACUUM skipped - table is clean');
        }
      }

      // Update statistics
      await this.db.query('ANALYZE addresses');
      console.log('✅ Updated table statistics');

    } catch (error) {
      console.log(`❌ Maintenance failed: ${error.message}`);
    }
  }

  async testPerformanceImprovement() {
    console.log('🏃 Testing performance with optimizations...');

    const currentTime = Math.floor(Date.now() / 1000);
    const testQueries = [
      // Backend API queries (most critical for users)
      {
        name: '🔥 Backend API: List addresses (sorted)',
        sql: `SELECT address, contract_name, deployed, fund, network
              FROM addresses
              WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags))
              ORDER BY fund DESC NULLS LAST, deployed DESC NULLS LAST, address ASC
              LIMIT 50`,
        params: []
      },
      {
        name: '🔥 Backend API: Address prefix search',
        sql: `SELECT address FROM addresses
              WHERE (tags IS NULL OR NOT 'EOA' = ANY(tags)) AND address LIKE $1
              LIMIT 10`,
        params: ['0xa%']
      },

      // Scanner queries
      {
        name: 'Scanner: DataRevalidator',
        sql: `SELECT COUNT(*) FROM addresses
              WHERE network = $1
              AND (tags IS NULL OR tags = '{}' OR NOT ('Contract' = ANY(tags)) AND NOT ('EOA' = ANY(tags)))`,
        params: ['ethereum']
      },
      {
        name: 'Scanner: FundUpdater',
        sql: `SELECT COUNT(*) FROM addresses
              WHERE network = $1
              AND (last_fund_updated IS NULL OR last_fund_updated < $2)`,
        params: ['ethereum', currentTime - 604800]
      }
    ];

    for (const query of testQueries) {
      try {
        const startTime = Date.now();
        const result = await this.db.query(query.sql, query.params || []);
        const duration = Date.now() - startTime;

        const rowCount = result.rows[0]?.count || result.rows.length;
        console.log(`  📊 ${query.name}: ${rowCount} rows (${duration}ms)`);

        if (duration > 2000) {
          console.log(`    🐌 Still slow - consider further optimization`);
        } else if (duration > 500) {
          console.log(`    ⚠️  Acceptable but could be better`);
        } else if (duration < 100) {
          console.log(`    🚀 Excellent performance!`);
        } else {
          console.log(`    ✅ Good performance`);
        }

      } catch (error) {
        console.log(`  ❌ ${query.name} failed: ${error.message}`);
      }
    }
  }

  async cleanup() {
    if (this.db) this.db.release();
    if (this.pool) await this.pool.end();
  }

  async run() {
    console.log('🚀 Starting database optimization...\n');

    try {
      await this.createAdvancedIndexes();
      console.log('');

      await this.performMaintenance();
      console.log('');

      await this.testPerformanceImprovement();

      console.log('\n🎉 Database optimization completed!');
      console.log('\n💡 Recommendations:');
      console.log('   - Run this script weekly or after major data imports');
      console.log('   - Run VACUUM during low-traffic periods');
      console.log('   - Monitor query performance in production logs');

    } catch (error) {
      console.error('❌ Optimization failed:', error.message);
      throw error;
    }
  }
}

async function main() {
  const optimizer = new DatabaseOptimizer();

  try {
    await optimizer.initialize();
    await optimizer.run();
  } catch (error) {
    console.error('💥 Optimization failed:', error.message);
    process.exit(1);
  } finally {
    await optimizer.cleanup();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DatabaseOptimizer;
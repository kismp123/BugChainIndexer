#!/usr/bin/env node
/**
 * Large Dataset Database Optimization
 * Specialized optimizations for 10GB+ databases
 */

const { Pool } = require('pg');

class LargeDatasetOptimizer {
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
    console.log('🔧 Creating advanced indexes for large dataset...');
    
    const advancedIndexes = [
      {
        name: 'idx_addresses_composite_revalidation',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_composite_revalidation 
              ON addresses(network, last_updated) 
              WHERE (tags IS NULL OR tags = '{}' OR ARRAY_LENGTH(tags, 1) IS NULL OR 
                     (tags IS NOT NULL AND NOT ('Contract' = ANY(tags)) AND NOT ('EOA' = ANY(tags))))`,
        description: 'Composite index for DataRevalidator with last_updated ordering'
      },
      {
        name: 'idx_addresses_fund_epoch_based',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_fund_epoch_based 
              ON addresses(network, last_fund_updated) 
              WHERE (last_fund_updated IS NULL OR last_fund_updated < 1736380800)`, // Static epoch for better performance
        description: 'Epoch-based partial index for FundUpdater'
      },
      {
        name: 'idx_addresses_recent_activity',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_recent_activity 
              ON addresses(network, last_updated DESC) 
              WHERE last_updated > 1736000000`, // Recent activity only
        description: 'Index for recent activity queries (UnifiedScanner)'
      },
      {
        name: 'idx_addresses_network_hash_deployed',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_network_hash_deployed 
              ON addresses(network, code_hash, deployed) 
              WHERE code_hash IS NOT NULL AND code_hash != '' AND code_hash != '0x0000000000000000000000000000000000000000000000000000000000000000'`,
        description: 'Composite index for contract queries'
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

  async removeRedundantIndexes() {
    console.log('🗑️  Analyzing and removing redundant indexes...');
    
    // Get index usage statistics
    const indexStats = await this.db.query(`
      SELECT 
        indexrelname as index_name,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes 
      WHERE schemaname = 'public' AND relname = 'addresses'
      ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC
    `);

    console.log('\n📊 Index usage analysis:');
    const lowUsageIndexes = [];
    
    for (const idx of indexStats.rows) {
      const scans = parseInt(idx.idx_scan) || 0;
      const sizeStr = idx.size;
      
      console.log(`  ${idx.index_name}: ${scans} scans, ${sizeStr}`);
      
      // Mark as low usage if < 100 scans and > 100MB
      if (scans < 100 && sizeStr.includes('MB')) {
        const sizeMB = parseInt(sizeStr.match(/\d+/)[0]);
        if (sizeMB > 100) {
          lowUsageIndexes.push(idx.index_name);
        }
      }
    }

    if (lowUsageIndexes.length > 0) {
      console.log(`\n🚨 Found ${lowUsageIndexes.length} low-usage large indexes:`);
      lowUsageIndexes.forEach(idx => console.log(`  - ${idx}`));
      
      console.log('\n⚠️  Consider removing these manually if confirmed unused:');
      lowUsageIndexes.forEach(idx => {
        console.log(`  DROP INDEX IF EXISTS ${idx};`);
      });
    }
  }

  async optimizeForLargeDataset() {
    console.log('⚙️  Applying large dataset optimizations...');
    
    const optimizations = [
      // Increase work memory for large operations
      "SET work_mem = '1GB'",
      "SET maintenance_work_mem = '2GB'",
      
      // Optimize for large datasets
      "SET random_page_cost = 1.0",
      "SET seq_page_cost = 1.0",
      "SET cpu_tuple_cost = 0.005",
      "SET cpu_index_tuple_cost = 0.0025",
      "SET cpu_operator_cost = 0.001",
      
      // Enable parallel operations
      "SET max_parallel_workers_per_gather = 4",
      "SET parallel_tuple_cost = 0.05",
      "SET parallel_setup_cost = 500",
      
      // Optimize join behavior
      "SET join_collapse_limit = 12",
      "SET from_collapse_limit = 12",
      
      // Disable JIT for complex queries (can be slower for large datasets)
      "SET jit = off"
    ];

    let successCount = 0;
    for (const setting of optimizations) {
      try {
        await this.db.query(setting);
        console.log(`  ✅ ${setting}`);
        successCount++;
      } catch (error) {
        console.log(`  ⚠️  ${setting} - ${error.message.split('\n')[0]}`);
      }
    }
    
    console.log(`Applied ${successCount}/${optimizations.length} large dataset optimizations`);
  }

  async performMaintenance() {
    console.log('🔧 Performing maintenance for large dataset...');
    
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
        
        if (deadRatio > 2) {  // Lower threshold for large datasets
          console.log('🧹 Running VACUUM (this will take 10-30 minutes for large dataset)...');
          const startTime = Date.now();
          
          // Use less aggressive VACUUM for large datasets
          await this.db.query('VACUUM (ANALYZE, VERBOSE) addresses');
          
          const duration = Math.round((Date.now() - startTime) / 1000);
          console.log(`✅ VACUUM completed (${Math.floor(duration/60)}m ${duration%60}s)`);
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
    
    // Optimized queries with parameterization
    const currentTime = Math.floor(Date.now() / 1000);
    const testQueries = [
      {
        name: 'DataRevalidator (optimized with params)',
        sql: `SELECT COUNT(*) FROM addresses 
              WHERE network = $1 
              AND (tags IS NULL OR tags = '{}' OR NOT ('Contract' = ANY(tags)) AND NOT ('EOA' = ANY(tags)))`,
        params: ['ethereum']
      },
      {
        name: 'FundUpdater (optimized with params)',
        sql: `SELECT COUNT(*) FROM addresses 
              WHERE network = $1 
              AND (last_fund_updated IS NULL OR last_fund_updated < $2)`,
        params: ['ethereum', currentTime - 604800]
      },
      {
        name: 'UnifiedScanner (optimized with params)',
        sql: `SELECT COUNT(*) FROM addresses 
              WHERE network = $1 
              AND last_updated > $2`,
        params: ['ethereum', currentTime - 14400]
      }
    ];

    for (const query of testQueries) {
      try {
        const startTime = Date.now();
        const result = await this.db.query(query.sql, query.params || []);
        const duration = Date.now() - startTime;
        
        console.log(`  📊 ${query.name}: ${result.rows[0].count} rows (${duration}ms)`);
        
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
    console.log('🚀 Starting large dataset optimization...\n');
    
    try {
      await this.createAdvancedIndexes();
      console.log('');
      
      await this.removeRedundantIndexes();
      console.log('');
      
      await this.optimizeForLargeDataset();
      console.log('');
      
      await this.performMaintenance();
      console.log('');
      
      await this.testPerformanceImprovement();
      
      console.log('\n🎉 Large dataset optimization completed!');
      console.log('\n💡 Additional recommendations:');
      console.log('   - Consider table partitioning if data continues to grow');
      console.log('   - Monitor index usage and remove unused ones regularly');
      console.log('   - Run VACUUM during low-traffic periods');
      console.log('   - Consider upgrading to PostgreSQL 15+ for better performance');
      
    } catch (error) {
      console.error('❌ Large dataset optimization failed:', error.message);
      throw error;
    }
  }
}

async function main() {
  const optimizer = new LargeDatasetOptimizer();
  
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

module.exports = LargeDatasetOptimizer;
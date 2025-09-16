#!/usr/bin/env node
/**
 * Database Cleanup and Index Optimization
 * Removes unused indexes and creates optimized ones
 */

const { Pool } = require('pg');

class DatabaseCleanup {
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

  async removeUnusedIndexes() {
    console.log('🗑️  Removing unused indexes...');
    
    const unusedIndexes = [
      'idx_addresses_address_prefix',
      'idx_addresses_network_tags',
      'idx_addresses_fund_updated',
      'idx_addresses_contract_name',
      'idx_addresses_fund_update'
    ];

    let removedCount = 0;
    for (const indexName of unusedIndexes) {
      try {
        await this.db.query(`DROP INDEX IF EXISTS ${indexName}`);
        console.log(`  ✅ Removed unused index: ${indexName}`);
        removedCount++;
      } catch (error) {
        console.log(`  ⚠️  Failed to remove ${indexName}: ${error.message}`);
      }
    }
    
    console.log(`Removed ${removedCount}/${unusedIndexes.length} unused indexes`);
  }

  async createOptimizedIndexes() {
    console.log('🔧 Creating optimized indexes...');
    
    const optimizedIndexes = [
      {
        name: 'idx_addresses_revalidation_partial',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_revalidation_partial 
              ON addresses(network) 
              WHERE (tags IS NULL OR tags = '{}' OR ARRAY_LENGTH(tags, 1) IS NULL OR 
                     (tags IS NOT NULL AND NOT ('Contract' = ANY(tags)) AND NOT ('EOA' = ANY(tags))))`,
        description: 'Optimized partial index for DataRevalidator queries'
      },
      {
        name: 'idx_addresses_fund_partial',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_fund_partial 
              ON addresses(network, last_fund_updated) 
              WHERE (last_fund_updated IS NULL OR last_fund_updated < EXTRACT(epoch FROM NOW()) - 604800)`,
        description: 'Partial index for FundUpdater outdated addresses'
      },
      {
        name: 'idx_addresses_tags_gin_partial',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_tags_gin_partial 
              ON addresses USING GIN(tags) 
              WHERE tags IS NOT NULL AND ARRAY_LENGTH(tags, 1) > 0`,
        description: 'Partial GIN index for tag searches (non-empty only)'
      },
      {
        name: 'idx_addresses_contract_code',
        sql: `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_contract_code 
              ON addresses(network, code_hash) 
              WHERE code_hash IS NOT NULL AND code_hash != '' AND code_hash != '0x0000000000000000000000000000000000000000000000000000000000000000'`,
        description: 'Partial index for contracts with code'
      }
    ];

    let createdCount = 0;
    for (const index of optimizedIndexes) {
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
    
    console.log(`Created/verified ${createdCount}/${optimizedIndexes.length} optimized indexes`);
  }

  async optimizeQueries() {
    console.log('📊 Running query optimization...');
    
    try {
      // Update table statistics
      await this.db.query('ANALYZE addresses');
      console.log('  ✅ Updated table statistics');
      
      // Recompute query plans
      await this.db.query('DISCARD PLANS');
      console.log('  ✅ Cleared query plan cache');
      
    } catch (error) {
      console.log(`  ❌ Query optimization failed: ${error.message}`);
    }
  }

  async testPerformance() {
    console.log('🏃 Testing query performance...');
    
    // Optimized queries with parameterization and specific columns
    const testQueries = [
      {
        name: 'DataRevalidator query (optimized)',
        sql: `SELECT COUNT(*) FROM addresses 
              WHERE network = $1 
              AND (tags IS NULL OR tags = '{}' OR NOT ('Contract' = ANY(tags)) AND NOT ('EOA' = ANY(tags)))`,
        params: ['ethereum']
      },
      {
        name: 'FundUpdater query (optimized)',
        sql: `SELECT COUNT(*) FROM addresses 
              WHERE network = $1 
              AND (last_fund_updated IS NULL OR last_fund_updated < $2)`,
        params: ['ethereum', Math.floor(Date.now() / 1000) - 604800]
      }
    ];

    for (const query of testQueries) {
      try {
        const startTime = Date.now();
        const result = await this.db.query(query.sql, query.params || []);
        const duration = Date.now() - startTime;
        
        console.log(`  📊 ${query.name}: ${result.rows[0].count} rows (${duration}ms)`);
        
        if (duration > 1000) {
          console.log(`    ⚠️  Still slow - may need further optimization`);
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
    if (this.db) {
      this.db.release();
    }
    if (this.pool) {
      await this.pool.end();
    }
  }

  async run() {
    console.log('🧹 Starting database cleanup and optimization...\n');
    
    try {
      await this.removeUnusedIndexes();
      console.log('');
      
      await this.createOptimizedIndexes();
      console.log('');
      
      await this.optimizeQueries();
      console.log('');
      
      await this.testPerformance();
      
      console.log('\n🎉 Database cleanup and optimization completed!');
      
    } catch (error) {
      console.error('❌ Cleanup failed:', error.message);
      throw error;
    }
  }
}

async function main() {
  const cleanup = new DatabaseCleanup();
  
  try {
    await cleanup.initialize();
    await cleanup.run();
  } catch (error) {
    console.error('💥 Database cleanup failed:', error.message);
    process.exit(1);
  } finally {
    await cleanup.cleanup();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DatabaseCleanup;
#!/usr/bin/env node
/**
 * Database Performance Optimization Tool
 * Usage: node utils/db-optimize.js [options]
 */

const { Pool } = require('pg');
const { closeDB } = require('../common/core');
const { optimizeDatabase, analyzeQueryPerformance, getIndexStats } = require('../common/database');

class DatabaseOptimizer {
  constructor(options = {}) {
    this.db = null;
    this.options = options;
  }

  async initialize() {
    console.log('🔗 Connecting to database...');
    
    try {
      // Create simple pool for DB operations with longer timeouts
      this.pool = new Pool({
        user: process.env.PGUSER || 'postgres',
        host: process.env.PGHOST || 'localhost',
        database: process.env.PGDATABASE || 'bugchain_indexer',
        password: process.env.PGPASSWORD || '',
        port: Number(process.env.PGPORT || 5432),
        max: 5,                          // Reduced max connections
        idleTimeoutMillis: 60000,        // 1 minute idle timeout
        connectionTimeoutMillis: 15000,   // 15 seconds to connect
      });
      
      // Test connection
      this.db = await this.pool.connect();
      
      // Test a simple query
      const result = await this.db.query('SELECT version()');
      console.log('✅ Database connected successfully');
      console.log(`📊 PostgreSQL version: ${result.rows[0].version.split(',')[0]}`);
      
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      console.error('💡 Check your database connection settings:');
      console.error(`   Host: ${process.env.PGHOST || 'localhost'}`);
      console.error(`   Port: ${process.env.PGPORT || 5432}`);
      console.error(`   Database: ${process.env.PGDATABASE || 'bugchain_indexer'}`);
      console.error(`   User: ${process.env.PGUSER || 'postgres'}`);
      throw error;
    }
  }

  async optimize() {
    console.log('\n🚀 Starting database optimization process...\n');
    
    // 1. Analyze current performance
    await this.analyzeCurrentState();
    
    // 2. Optimize database
    await this.runOptimization();
    
    // 3. Show results
    await this.showResults();
  }

  async analyzeCurrentState() {
    console.log('📊 Phase 1: Analyzing current database state...\n');
    
    try {
      // Get table statistics
      const stats = await getIndexStats(this.db, { verbose: true });
      
      // Analyze common queries
      await analyzeQueryPerformance(this.db);
      
    } catch (error) {
      console.error('❌ Analysis failed:', error.message);
    }
  }

  async runOptimization() {
    console.log('\n🔧 Phase 2: Running database optimizations...\n');
    
    try {
      const options = {
        skipVacuum: this.options && this.options.fast,
        verbose: true
      };
      
      await optimizeDatabase(this.db, options);
      
      // Additional optimizations
      await this.configureOptimalSettings();
      
    } catch (error) {
      console.error('❌ Optimization failed:', error.message);
    }
  }

  async configureOptimalSettings() {
    console.log('⚙️  Configuring optimal PostgreSQL settings for current session...');
    
    const sessionSettings = [
      // Session-level memory settings (safe to change)
      "SET work_mem = '256MB'",
      "SET maintenance_work_mem = '512MB'",
      
      // Query planner hints for current session
      "SET random_page_cost = 1.1",
      "SET seq_page_cost = 1.0",
      "SET cpu_tuple_cost = 0.01",
      "SET cpu_index_tuple_cost = 0.005",
      "SET cpu_operator_cost = 0.0025",
      
      // Enable more detailed statistics
      "SET log_statement_stats = off",
      "SET track_activities = on",
      "SET track_counts = on"
    ];

    let successCount = 0;
    for (const setting of sessionSettings) {
      try {
        await this.db.query(setting);
        console.log(`  ✅ ${setting}`);
        successCount++;
      } catch (error) {
        console.log(`  ⚠️  ${setting} - ${error.message.split('\n')[0]}`);
      }
    }
    
    console.log(`Applied ${successCount}/${sessionSettings.length} session optimizations`);
    
    // Show recommendations for server-level settings
    console.log('\n💡 Server-level optimizations (require admin access):');
    console.log('  shared_buffers = 25% of RAM (e.g., 1GB for 4GB system)');
    console.log('  effective_cache_size = 75% of RAM (e.g., 3GB for 4GB system)');
    console.log('  max_connections = adjust based on usage (50-200)');
    console.log('  autovacuum = on (should be enabled by default)');
  }

  async showResults() {
    console.log('\n📈 Phase 3: Performance improvement summary...\n');
    
    try {
      // Re-analyze to show improvements
      const postStats = await getIndexStats(this.db, { verbose: false });
      
      console.log('🎯 Optimization recommendations:');
      console.log('  1. Monitor query performance with: EXPLAIN ANALYZE <query>');
      console.log('  2. Run VACUUM ANALYZE periodically during low-traffic periods');
      console.log('  3. Consider partitioning if table grows beyond 10M rows');
      console.log('  4. Monitor index usage and remove unused indexes');
      console.log('  5. Use connection pooling in production');
      
      console.log('\n💡 Performance tips:');
      console.log('  - Use LIMIT in queries when possible');
      console.log('  - Avoid SELECT * in production queries');
      console.log('  - Use partial indexes for specific conditions');
      console.log('  - Consider using prepared statements for repeated queries');
      
    } catch (error) {
      console.error('❌ Results analysis failed:', error.message);
    }
  }

  async cleanup() {
    if (this.db) {
      try {
        this.db.release();
        console.log('🔌 Database client released');
      } catch (error) {
        console.warn('⚠️  Error releasing client:', error.message);
      }
    }
    if (this.pool) {
      try {
        await this.pool.end();
        console.log('🔌 Database pool closed');
      } catch (error) {
        console.warn('⚠️  Error closing pool:', error.message);
      }
    }
  }
}

// Command line interface
async function main() {
  const args = process.argv.slice(2);
  const options = {
    analyze: args.includes('--analyze'),
    optimize: args.includes('--optimize'),
    fast: args.includes('--fast'),
    help: args.includes('--help') || args.includes('-h')
  };

  if (options.help) {
    console.log(`
Database Performance Optimization Tool

Usage: node utils/db-optimize.js [options]

Options:
  --analyze    Only analyze current performance (no changes)
  --optimize   Run full optimization (default)
  --fast       Skip VACUUM operation (faster, less thorough)
  --help, -h   Show this help message

Examples:
  node utils/db-optimize.js --analyze           # Analysis only
  node utils/db-optimize.js --optimize          # Full optimization with VACUUM
  node utils/db-optimize.js --optimize --fast   # Fast optimization (skip VACUUM)
  node utils/db-optimize.js                     # Full optimization (default)
`);
    return;
  }

  const optimizer = new DatabaseOptimizer(options);
  
  try {
    await optimizer.initialize();
    
    if (options.analyze) {
      await optimizer.analyzeCurrentState();
    } else {
      await optimizer.optimize();
    }
    
  } catch (error) {
    console.error('💥 Optimization failed:', error.message);
    process.exit(1);
  } finally {
    await optimizer.cleanup();
  }

  console.log('\n🎉 Database optimization completed!');
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = DatabaseOptimizer;
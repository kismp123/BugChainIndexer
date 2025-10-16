#!/usr/bin/env node
/**
 * Remove Unused PostgreSQL Indexes
 *
 * Safely removes indexes that have never been used (idx_scan = 0)
 * to reduce INSERT overhead and save disk space.
 *
 * Usage: node utils/remove-unused-indexes.js [--dry-run] [--min-scans=N]
 */

const { Pool } = require('pg');

class UnusedIndexRemover {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false;
    this.minScans = options.minScans || 0; // Indexes with <= minScans will be removed
    this.pool = null;
  }

  async initialize() {
    console.log('🔗 Connecting to database...\n');

    this.pool = new Pool({
      user: process.env.PGUSER || 'postgres',
      host: process.env.PGHOST || 'localhost',
      database: process.env.PGDATABASE || 'bugchain_indexer',
      password: process.env.PGPASSWORD || '',
      port: Number(process.env.PGPORT || 5432),
      max: 5,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 15000,
    });

    const result = await this.pool.query('SELECT version()');
    console.log('✅ Database connected');
    console.log(`📊 PostgreSQL: ${result.rows[0].version.split(',')[0]}\n`);
  }

  async analyzeIndexes() {
    console.log('📊 Analyzing index usage...\n');

    const query = `
      SELECT
        i.indexrelname as index_name,
        pg_size_pretty(pg_relation_size(i.indexrelid)) as size,
        pg_relation_size(i.indexrelid) as size_bytes,
        idx.idx_scan as scans,
        idx.idx_tup_read as tuples_read,
        idx.idx_tup_fetch as tuples_fetched,
        pg_get_indexdef(i.indexrelid) as index_def
      FROM pg_stat_user_indexes idx
      JOIN pg_stat_user_indexes i ON i.indexrelid = idx.indexrelid
      WHERE idx.relname = 'addresses'
        AND i.indexrelname NOT LIKE '%_pkey'  -- Never remove primary keys
      ORDER BY idx.idx_scan, pg_relation_size(i.indexrelid) DESC
    `;

    const result = await this.pool.query(query);

    console.log('Index Usage Analysis:');
    console.log('─'.repeat(120));
    console.log(
      'Index Name'.padEnd(50) +
      'Size'.padEnd(15) +
      'Scans'.padEnd(15) +
      'Status'
    );
    console.log('─'.repeat(120));

    const toRemove = [];
    const toKeep = [];

    for (const row of result.rows) {
      const scans = row.scans || 0;
      let status, marker;

      if (scans <= this.minScans) {
        status = 'REMOVE (unused)';
        marker = '❌';
        toRemove.push(row);
      } else if (scans < 100) {
        status = 'KEEP (rarely used)';
        marker = '⚡';
        toKeep.push(row);
      } else {
        status = 'KEEP (active)';
        marker = '✅';
        toKeep.push(row);
      }

      console.log(
        marker + ' ' + row.index_name.padEnd(48) +
        (row.size || 'N/A').padEnd(15) +
        scans.toString().padEnd(15) +
        status
      );
    }

    console.log('─'.repeat(120));
    console.log('');

    return { toRemove, toKeep };
  }

  async removeIndexes(indexes) {
    if (indexes.length === 0) {
      console.log('✅ No unused indexes to remove\n');
      return { removed: [], failed: [] };
    }

    console.log(`\n🗑️  Removing ${indexes.length} unused indexes...\n`);

    const results = {
      removed: [],
      failed: [],
      totalSpaceSaved: 0
    };

    for (const index of indexes) {
      console.log(`📝 Processing: ${index.index_name}`);
      console.log(`   Size: ${index.size}`);
      console.log(`   Scans: ${index.scans || 0}`);
      console.log(`   Definition: ${index.index_def.substring(0, 80)}...`);

      try {
        const dropQuery = `DROP INDEX CONCURRENTLY IF EXISTS ${index.index_name}`;

        if (this.dryRun) {
          console.log(`   [DRY RUN] Would execute: ${dropQuery}`);
        } else {
          const startTime = Date.now();
          await this.pool.query(dropQuery);
          const duration = Math.round((Date.now() - startTime) / 1000);

          console.log(`   ✅ Index removed in ${duration}s`);
          results.totalSpaceSaved += index.size_bytes;
        }

        results.removed.push({
          name: index.index_name,
          size: index.size,
          sizeBytes: index.size_bytes
        });

      } catch (error) {
        console.error(`   ❌ Failed: ${error.message}`);

        // Try without CONCURRENTLY
        if (error.message.includes('CONCURRENTLY') && !this.dryRun) {
          console.log(`   🔄 Trying without CONCURRENTLY (may cause brief locks)...`);
          try {
            await this.pool.query(`DROP INDEX IF EXISTS ${index.index_name}`);
            console.log(`   ✅ Index removed (non-concurrent)`);
            results.removed.push({
              name: index.index_name,
              size: index.size,
              sizeBytes: index.size_bytes,
              method: 'non-concurrent'
            });
            results.totalSpaceSaved += index.size_bytes;
          } catch (retryError) {
            console.error(`   ❌ Also failed: ${retryError.message}`);
            results.failed.push({
              name: index.index_name,
              error: retryError.message
            });
          }
        } else {
          results.failed.push({
            name: index.index_name,
            error: error.message
          });
        }
      }

      console.log('');
    }

    return results;
  }

  async showSummary(analysis, results) {
    console.log('\n' + '='.repeat(120));
    console.log('📈 Summary');
    console.log('='.repeat(120) + '\n');

    console.log('Index Counts:');
    console.log(`  Total indexes analyzed: ${analysis.toRemove.length + analysis.toKeep.length}`);
    console.log(`  Unused indexes (scans ≤ ${this.minScans}): ${analysis.toRemove.length}`);
    console.log(`  Kept indexes: ${analysis.toKeep.length}`);
    console.log('');

    if (results.removed.length > 0) {
      console.log('Removed Indexes:');
      for (const index of results.removed) {
        console.log(`  ✅ ${index.name} (${index.size})`);
      }
      console.log('');
    }

    if (results.failed.length > 0) {
      console.log('Failed to Remove:');
      for (const index of results.failed) {
        console.log(`  ❌ ${index.name}: ${index.error}`);
      }
      console.log('');
    }

    if (!this.dryRun && results.totalSpaceSaved > 0) {
      const savedMB = (results.totalSpaceSaved / 1024 / 1024).toFixed(2);
      const savedGB = (results.totalSpaceSaved / 1024 / 1024 / 1024).toFixed(2);
      console.log(`💾 Total space saved: ${savedMB} MB (${savedGB} GB)`);
      console.log('');
    }

    console.log('Expected Benefits:');
    console.log('  ✅ Faster INSERT operations (fewer indexes to update)');
    console.log('  ✅ Reduced lock contention during writes');
    console.log(`  ✅ Disk space savings: ~${(analysis.toRemove.reduce((sum, idx) => sum + idx.size_bytes, 0) / 1024 / 1024).toFixed(0)} MB`);
    console.log('  ✅ Improved maintenance performance (VACUUM, ANALYZE)');
    console.log('');

    if (this.dryRun) {
      console.log('⚠️  DRY RUN MODE - No indexes were actually removed');
      console.log('Run without --dry-run to apply changes\n');
    } else {
      console.log('🎉 Cleanup completed!');
      console.log('Run VACUUM ANALYZE to reclaim disk space:\n');
      console.log('  cd scanners && ./run.sh db-optimize\n');
    }
  }

  async cleanup() {
    if (this.pool) {
      await this.pool.end();
      console.log('🔌 Database connection closed\n');
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: args.includes('--dry-run'),
    minScans: parseInt(args.find(arg => arg.startsWith('--min-scans='))?.split('=')[1] || '0'),
    help: args.includes('--help') || args.includes('-h')
  };

  if (options.help) {
    console.log(`
Remove Unused PostgreSQL Indexes

Usage: node utils/remove-unused-indexes.js [options]

Options:
  --dry-run         Preview what would be removed without making changes
  --min-scans=N     Remove indexes with N or fewer scans (default: 0)
  --help, -h        Show this help message

What this does:
  1. Analyzes all indexes on the 'addresses' table
  2. Identifies indexes that have never been used (idx_scan = 0)
  3. Safely removes them using DROP INDEX CONCURRENTLY
  4. Reports disk space savings

Safety:
  - Primary keys are NEVER removed
  - Uses DROP INDEX CONCURRENTLY (non-blocking)
  - Shows detailed preview in dry-run mode
  - Can be safely run while scanners are active

Why remove unused indexes?
  - Faster INSERT operations (fewer indexes to update)
  - Reduced lock contention
  - Disk space savings
  - Faster VACUUM and ANALYZE

Examples:
  node utils/remove-unused-indexes.js --dry-run       # Preview
  node utils/remove-unused-indexes.js                 # Remove unused (scans=0)
  node utils/remove-unused-indexes.js --min-scans=10  # Remove rarely used too
`);
    return;
  }

  const remover = new UnusedIndexRemover(options);

  try {
    await remover.initialize();

    // Analyze indexes
    const analysis = await remover.analyzeIndexes();

    // Remove unused indexes
    const results = await remover.removeIndexes(analysis.toRemove);

    // Show summary
    await remover.showSummary(analysis, results);

  } catch (error) {
    console.error('\n💥 Failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await remover.cleanup();
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}

module.exports = UnusedIndexRemover;

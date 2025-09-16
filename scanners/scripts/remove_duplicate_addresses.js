#!/usr/bin/env node
/**
 * Duplicate Address Remover
 * Removes duplicate addresses from the database, keeping the most recent/complete record
 */

const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'bugchain_indexer',
  password: process.env.PGPASSWORD || '',
  port: Number(process.env.PGPORT || 5432),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

class DuplicateAddressRemover {
  constructor() {
    this.stats = {
      totalDuplicates: 0,
      duplicateGroups: 0,
      recordsRemoved: 0,
      recordsKept: 0,
      errors: 0
    };
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '📋';
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  async findDuplicates() {
    this.log('🔍 Searching for duplicate addresses...');

    try {
      const limit = process.env.LIMIT_DUPLICATES ? parseInt(process.env.LIMIT_DUPLICATES) : 0; // 0 means no limit
      const limitClause = limit > 0 ? `LIMIT ${limit}` : '';
      
      const duplicateQuery = `
        SELECT 
          LOWER(address) as normalized_address,
          network,
          COUNT(*) as duplicate_count,
          array_agg(address ORDER BY 
            CASE WHEN contract_name IS NOT NULL AND contract_name != '' THEN 1 ELSE 2 END,
            CASE WHEN deployed IS NOT NULL AND deployed > 0 THEN 1 ELSE 2 END,
            fund DESC NULLS LAST,
            last_updated DESC NULLS LAST
          ) as addresses
        FROM addresses
        GROUP BY LOWER(address), network
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        ${limitClause}
      `;

      const result = await pool.query(duplicateQuery);
      this.stats.duplicateGroups = result.rows.length;
      
      if (result.rows.length === 0) {
        this.log('✅ No duplicate addresses found');
        return [];
      }

      let totalDuplicates = 0;
      result.rows.forEach(row => {
        totalDuplicates += row.duplicate_count - 1; // -1 because we keep one record
      });

      this.stats.totalDuplicates = totalDuplicates;
      this.log(`Found ${this.stats.duplicateGroups} duplicate groups with ${totalDuplicates} excess records`);
      
      // Show sample duplicates
      this.log('📋 Sample duplicate groups:');
      result.rows.slice(0, 5).forEach(row => {
        this.log(`   ${row.network}: ${row.normalized_address} (${row.duplicate_count} copies)`);
        row.addresses.forEach((addr, idx) => {
          const marker = idx === 0 ? '✅ KEEP' : '❌ REMOVE';
          this.log(`      ${marker}: ${addr}`);
        });
      });

      return result.rows;

    } catch (error) {
      this.log(`Error finding duplicates: ${error.message}`, 'error');
      throw error;
    }
  }

  async removeDuplicates(duplicateGroups) {
    if (duplicateGroups.length === 0) return;

    this.log('🔄 Starting duplicate removal process...');

    const batchSize = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 5000; // Large default for complete cleanup
    let processedGroups = 0;
    let totalRemoved = 0;

    try {
      // Process in batches with transaction support
      for (let i = 0; i < duplicateGroups.length; i += batchSize) {
        const batch = duplicateGroups.slice(i, i + batchSize);
        
        // Use transaction for each batch to ensure consistency
        const client = await pool.connect();
        
        try {
          await client.query('BEGIN');
          let batchRemoved = 0;

          for (const group of batch) {
            try {
              const addressesToRemove = group.addresses.slice(1); // Keep first, remove rest
              const addressToKeep = group.addresses[0];

              if (addressesToRemove.length > 0) {
                // Remove duplicates
                const deleteQuery = `
                  DELETE FROM addresses 
                  WHERE address = ANY($1) AND network = $2
                `;

                const deleteResult = await client.query(deleteQuery, [addressesToRemove, group.network]);
                const removedCount = deleteResult.rowCount;

                // Update the kept address to lowercase if needed
                const updateQuery = `
                  UPDATE addresses 
                  SET address = $1,
                      last_updated = EXTRACT(EPOCH FROM NOW())
                  WHERE address = $2 AND network = $3
                `;

                await client.query(updateQuery, [
                  group.normalized_address,
                  addressToKeep,
                  group.network
                ]);

                batchRemoved += removedCount;
                this.stats.recordsRemoved += removedCount;
                this.stats.recordsKept += 1;

                if (removedCount > 0) {
                  this.log(`✅ ${group.network}: ${group.normalized_address} - Removed ${removedCount} duplicates`);
                }
              }

            } catch (error) {
              this.stats.errors++;
              this.log(`❌ Error processing ${group.network}:${group.normalized_address} - ${error.message}`, 'error');
            }
          }

          await client.query('COMMIT');
          totalRemoved += batchRemoved;
          
        } catch (error) {
          await client.query('ROLLBACK');
          this.log(`❌ Batch transaction failed, rolled back: ${error.message}`, 'error');
        } finally {
          client.release();
        }

        processedGroups += batch.length;
        this.log(`📈 Progress: ${processedGroups}/${duplicateGroups.length} groups processed (${totalRemoved} duplicates removed)`);

        // Small delay to prevent overwhelming the database
        if (i + batchSize < duplicateGroups.length) {
          await this.sleep(50); // Reduced delay since we're using transactions
        }
      }

      this.log(`🎉 Duplicate removal completed! Removed ${totalRemoved} duplicate records`);

    } catch (error) {
      this.log(`Error during duplicate removal: ${error.message}`, 'error');
      throw error;
    }
  }

  async validateRemoval() {
    this.log('🔍 Validating duplicate removal...');

    try {
      // Check for remaining duplicates
      const validationQuery = `
        SELECT 
          LOWER(address) as normalized_address,
          network,
          COUNT(*) as count
        FROM addresses
        GROUP BY LOWER(address), network
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT 10
      `;

      const result = await pool.query(validationQuery);
      
      if (result.rows.length === 0) {
        this.log('✅ Validation passed: No duplicate addresses remain');
      } else {
        this.log(`⚠️ Validation warning: Found ${result.rows.length} remaining duplicate groups`, 'warn');
        result.rows.forEach(row => {
          this.log(`   ${row.network}: ${row.normalized_address} (${row.count} copies)`, 'warn');
        });
      }

    } catch (error) {
      this.log(`Error during validation: ${error.message}`, 'error');
    }
  }

  async showStatistics() {
    this.log('📊 Final statistics...');

    try {
      const statsQuery = `
        SELECT network, 
               COUNT(*) as total_addresses,
               COUNT(DISTINCT LOWER(address)) as unique_addresses
        FROM addresses 
        GROUP BY network
        ORDER BY network
      `;

      const result = await pool.query(statsQuery);
      
      this.log('📈 Address statistics by network:');
      result.rows.forEach(row => {
        this.log(`   ${row.network}: ${row.total_addresses} total, ${row.unique_addresses} unique`);
      });

      // Overall statistics
      const totalQuery = `
        SELECT 
          COUNT(*) as total_addresses,
          COUNT(DISTINCT LOWER(address)) as unique_addresses
        FROM addresses
      `;

      const totalResult = await pool.query(totalQuery);
      const total = totalResult.rows[0];
      
      this.log('📊 Overall statistics:');
      this.log(`   Total addresses: ${total.total_addresses}`);
      this.log(`   Unique addresses: ${total.unique_addresses}`);
      this.log(`   Duplicates removed: ${this.stats.recordsRemoved}`);
      this.log(`   Records kept: ${this.stats.recordsKept}`);

    } catch (error) {
      this.log(`Error getting statistics: ${error.message}`, 'error');
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async run() {
    this.log('🚀 Starting Duplicate Address Removal Process');
    this.log(`Database: ${process.env.PGDATABASE || 'bugchain_indexer'}`);

    try {
      // Step 1: Find all duplicate addresses
      const duplicates = await this.findDuplicates();

      if (duplicates.length === 0) {
        this.log('✅ No duplicates found - database is clean');
        return;
      }

      // Step 2: Confirm removal (in production, you might want user confirmation)
      const dryRun = process.env.DRY_RUN === 'true';
      
      if (dryRun) {
        this.log('🔍 DRY RUN MODE: No changes will be made');
        return;
      }

      this.log(`⚠️ About to remove ${this.stats.totalDuplicates} duplicate records from ${this.stats.duplicateGroups} groups`);
      
      // Step 3: Remove duplicates
      await this.removeDuplicates(duplicates);

      // Step 4: Validate results
      await this.validateRemoval();

      // Step 5: Show final statistics
      await this.showStatistics();

      this.log('✅ Duplicate address removal completed successfully');

    } catch (error) {
      this.log(`❌ Process failed: ${error.message}`, 'error');
      process.exit(1);
    } finally {
      await pool.end();
    }
  }
}

// Execute if run directly
if (require.main === module) {
  console.log('📋 Duplicate Address Remover');
  console.log('=============================');
  console.log('Environment variables:');
  console.log('  DRY_RUN=true          - Preview changes without making them');
  console.log('  BATCH_SIZE=5000       - Number of duplicate groups to process per batch (default: 5000)');
  console.log('  LIMIT_DUPLICATES=0    - Maximum duplicate groups to find (default: 0 = no limit, process ALL)');
  console.log('');
  
  const remover = new DuplicateAddressRemover();
  remover.run()
    .then(() => {
      console.log('✅ Process completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Process failed:', error);
      process.exit(1);
    });
}

module.exports = DuplicateAddressRemover;
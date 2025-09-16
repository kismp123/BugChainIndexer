#!/usr/bin/env node
/**
 * Address Lowercase Converter
 * Converts all addresses in the database to lowercase for consistency
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

class AddressLowercaseConverter {
  constructor() {
    this.stats = {
      totalChecked: 0,
      totalConverted: 0,
      alreadyLowercase: 0,
      errors: 0
    };
  }

  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '📋';
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  async checkAndConvertAddresses() {
    this.log('🔍 Checking addresses that need lowercase conversion...');

    try {
      // First, check how many addresses need conversion
      const checkQuery = `
        SELECT COUNT(*) as count
        FROM addresses 
        WHERE address != LOWER(address)
      `;
      
      const checkResult = await pool.query(checkQuery);
      const needsConversion = parseInt(checkResult.rows[0].count);
      
      this.log(`Found ${needsConversion} addresses that need lowercase conversion`);
      
      if (needsConversion === 0) {
        this.log('✅ All addresses are already in lowercase format');
        return;
      }

      // Update addresses in batches to avoid locking the table for too long
      const batchSize = 10000;
      let totalUpdated = 0;

      this.log(`🔄 Starting conversion in batches of ${batchSize}...`);

      while (true) {
        const updateQuery = `
          WITH batch AS (
            SELECT address 
            FROM addresses 
            WHERE address != LOWER(address)
            LIMIT $1
          )
          UPDATE addresses 
          SET address = LOWER(address),
              last_updated = EXTRACT(EPOCH FROM NOW())
          WHERE address IN (SELECT address FROM batch)
          RETURNING address
        `;

        const result = await pool.query(updateQuery, [batchSize]);
        const updatedCount = result.rows.length;

        if (updatedCount === 0) {
          break; // No more addresses to update
        }

        totalUpdated += updatedCount;
        this.stats.totalConverted += updatedCount;
        
        this.log(`✅ Converted ${updatedCount} addresses to lowercase (Total: ${totalUpdated})`);

        // Small delay to prevent overwhelming the database
        await this.sleep(100);
      }

      this.log(`🎉 Conversion completed! Updated ${totalUpdated} addresses to lowercase`);

    } catch (error) {
      this.log(`Error during conversion: ${error.message}`, 'error');
      throw error;
    }
  }

  async createLowercaseIndex() {
    this.log('🔧 Creating optimized index for lowercase addresses...');

    try {
      // Create index on LOWER(address) for faster searches
      const indexQuery = `
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_addresses_lower_address 
        ON addresses (LOWER(address))
      `;

      await pool.query(indexQuery);
      this.log('✅ Lowercase address index created successfully');

    } catch (error) {
      if (error.message.includes('already exists')) {
        this.log('📋 Lowercase address index already exists');
      } else {
        this.log(`Warning: Could not create index: ${error.message}`, 'warn');
      }
    }
  }

  async validateConversion() {
    this.log('🔍 Validating conversion results...');

    try {
      // Check for any remaining uppercase addresses
      const validationQuery = `
        SELECT COUNT(*) as count
        FROM addresses 
        WHERE address != LOWER(address)
      `;

      const result = await pool.query(validationQuery);
      const remaining = parseInt(result.rows[0].count);

      if (remaining === 0) {
        this.log('✅ Validation passed: All addresses are now in lowercase');
      } else {
        this.log(`⚠️ Validation warning: ${remaining} addresses still need conversion`, 'warn');
      }

      // Show sample addresses to verify format
      const sampleQuery = `
        SELECT address, network 
        FROM addresses 
        LIMIT 5
      `;

      const sampleResult = await pool.query(sampleQuery);
      this.log('📋 Sample addresses after conversion:');
      sampleResult.rows.forEach(row => {
        this.log(`   ${row.network}: ${row.address}`);
      });

    } catch (error) {
      this.log(`Error during validation: ${error.message}`, 'error');
    }
  }

  async updateNetworkStatistics() {
    this.log('📊 Updating network statistics...');

    try {
      const statsQuery = `
        SELECT network, 
               COUNT(*) as total_addresses,
               COUNT(CASE WHEN address = LOWER(address) THEN 1 END) as lowercase_addresses
        FROM addresses 
        GROUP BY network
        ORDER BY network
      `;

      const result = await pool.query(statsQuery);
      
      this.log('📈 Network statistics after conversion:');
      result.rows.forEach(row => {
        const percentage = ((row.lowercase_addresses / row.total_addresses) * 100).toFixed(1);
        this.log(`   ${row.network}: ${row.lowercase_addresses}/${row.total_addresses} (${percentage}%) lowercase`);
      });

    } catch (error) {
      this.log(`Error getting statistics: ${error.message}`, 'error');
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async run() {
    this.log('🚀 Starting Address Lowercase Conversion Process');
    this.log(`Database: ${process.env.PGDATABASE || 'bugchain_indexer'}`);

    try {
      // Step 1: Check and convert addresses
      await this.checkAndConvertAddresses();

      // Step 2: Create optimized index
      await this.createLowercaseIndex();

      // Step 3: Validate results
      await this.validateConversion();

      // Step 4: Show statistics
      await this.updateNetworkStatistics();

      this.log('✅ Address lowercase conversion completed successfully');

    } catch (error) {
      this.log(`❌ Conversion failed: ${error.message}`, 'error');
      process.exit(1);
    } finally {
      await pool.end();
    }
  }
}

// Execute if run directly
if (require.main === module) {
  console.log('📋 Address Lowercase Converter');
  console.log('===============================');
  
  const converter = new AddressLowercaseConverter();
  converter.run()
    .then(() => {
      console.log('✅ Process completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Process failed:', error);
      process.exit(1);
    });
}

module.exports = AddressLowercaseConverter;
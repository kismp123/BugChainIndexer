#!/usr/bin/env node
/**
 * Test FundUpdater with Alchemy Portfolio API
 * Tests the fund update process using fetchPortfolioWithAlchemy
 */

const chalk = require('chalk');
require('dotenv').config();
const { Pool } = require('pg');

async function testFundUpdaterWithAlchemy() {
  console.log(chalk.cyan.bold('\n🧪 Testing FundUpdater with Alchemy API\n'));
  console.log(chalk.gray('=' .repeat(60)));
  
  const FundUpdater = require('../core/FundUpdater');
  
  try {
    const updater = new FundUpdater();
    await updater.initialize();
    
    // Test addresses with known balances
    const testAddresses = [
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', // vitalik.eth
      '0xcB1C1FdE09f811B294172696404e88E658659905', // Test wallet
      '0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5'  // Another test wallet
    ];
    
    // First, let's check current fund values in database
    const pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: process.env.PGPORT || 5432,
      database: process.env.PGDATABASE || 'bugchain_indexer',
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || ''
    });
    
    console.log(chalk.yellow('\n📍 Current fund values in database:\n'));
    
    for (const address of testAddresses) {
      try {
        const result = await pool.query(
          'SELECT address, network, fund, last_fund_updated FROM addresses WHERE LOWER(address) = LOWER($1)',
          [address]
        );
        
        if (result.rows.length > 0) {
          const row = result.rows[0];
          console.log(chalk.gray(`${address}:`));
          console.log(chalk.gray(`  Current fund: $${row.fund || 0}`));
          console.log(chalk.gray(`  Last updated: ${row.last_fund_updated || 'Never'}\n`));
        } else {
          console.log(chalk.gray(`${address}: Not in database yet\n`));
          // Insert the address if it doesn't exist
          await pool.query(
            'INSERT INTO addresses (address, network, status, created_at) VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING',
            [address.toLowerCase(), 'ethereum', 'active']
          );
        }
      } catch (error) {
        console.log(chalk.red(`Error checking ${address}: ${error.message}\n`));
      }
    }
    
    console.log(chalk.yellow('\n📍 Running FundUpdater with Alchemy API:\n'));
    
    // Update funds for test addresses
    const startTime = Date.now();
    await updater.updateAddressFunds(testAddresses);
    const duration = Date.now() - startTime;
    
    console.log(chalk.green(`\n✅ Update completed in ${duration}ms`));
    
    console.log(chalk.yellow('\n📍 Updated fund values in database:\n'));
    
    // Check updated values
    for (const address of testAddresses) {
      const result = await pool.query(
        'SELECT address, network, fund, last_fund_updated FROM addresses WHERE LOWER(address) = LOWER($1)',
        [address]
      );
      
      if (result.rows.length > 0) {
        const row = result.rows[0];
        console.log(chalk.green(`${address}:`));
        console.log(chalk.white(`  Updated fund: $${row.fund || 0}`));
        console.log(chalk.gray(`  Last updated: ${row.last_fund_updated}\n`));
      }
    }
    
    // Test the cache effectiveness
    console.log(chalk.yellow('\n📍 Testing cache effectiveness (second run):\n'));
    
    const cacheStartTime = Date.now();
    await updater.updateAddressFunds(testAddresses);
    const cacheDuration = Date.now() - cacheStartTime;
    
    console.log(chalk.green(`✅ Cache run completed in ${cacheDuration}ms (${Math.round((duration - cacheDuration) / duration * 100)}% faster)`));
    
    // Get cache statistics
    console.log(chalk.yellow('\n📍 Cache Statistics:\n'));
    
    const priceStats = await updater.priceCache.getCacheStats();
    console.log(chalk.white('Price Cache:'));
    priceStats.forEach(stat => {
      console.log(chalk.gray(`  ${stat.network}: ${stat.token_count} tokens, avg age: ${stat.avg_age_hours}h`));
    });
    
    const metadataStats = await updater.metadataCache.getCacheStats();
    console.log(chalk.white('\nMetadata Cache:'));
    metadataStats.forEach(stat => {
      console.log(chalk.gray(`  ${stat.network}: ${stat.token_count} tokens, avg age: ${stat.avg_age_days}d`));
    });
    
    // Close connections
    await pool.end();
    await updater.priceCache.close();
    await updater.metadataCache.close();
    
    console.log(chalk.green('\n✅ Test completed successfully'));
    
  } catch (error) {
    console.error(chalk.red('❌ Test failed:'), error.message);
    console.error(error.stack);
    process.exit(1);
  }
  
  process.exit(0);
}

// Run the test
testFundUpdaterWithAlchemy().catch(error => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
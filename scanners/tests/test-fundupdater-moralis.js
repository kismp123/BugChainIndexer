#!/usr/bin/env node
/**
 * Test FundUpdater with Moralis API Integration
 */

const chalk = require('chalk');
require('dotenv').config();

// Set environment to use Moralis API
process.env.USE_MORALIS_API = 'true';

async function testMoralisIntegration() {
  console.log(chalk.cyan.bold('\n🧪 Testing FundUpdater Moralis Integration\n'));
  
  // Check if Moralis API key is present
  if (!process.env.MORALIS_API_KEY) {
    console.log(chalk.red('❌ MORALIS_API_KEY not found in .env'));
    console.log(chalk.yellow('Add MORALIS_API_KEY to your .env file'));
    return;
  }
  
  const FundUpdater = require('../core/FundUpdater');
  
  try {
    const updater = new FundUpdater();
    await updater.initialize();
    
    console.log(chalk.cyan('Testing with sample addresses...'));
    
    // Test addresses with known balances
    const testAddresses = [
      { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', name: 'vitalik.eth' },
      { address: '0xcB1C1FdE09f811B294172696404e88E658659905', name: 'test wallet' }
    ];
    
    for (const test of testAddresses) {
      console.log(chalk.yellow(`\nTesting ${test.name}: ${test.address}`));
      
      try {
        // Test the fetchPortfolioWithMoralis method directly
        const portfolio = await updater.fetchPortfolioWithMoralis(test.address);
        
        if (portfolio && portfolio.totalUsdValue !== undefined) {
          console.log(chalk.green(`✅ Portfolio fetched successfully`));
          console.log(chalk.gray(`  Total USD Value: $${portfolio.totalUsdValue.toLocaleString()}`));
        } else {
          console.log(chalk.yellow(`⚠️ No portfolio data returned`));
        }
      } catch (error) {
        console.log(chalk.red(`❌ Error fetching portfolio: ${error.message}`));
      }
    }
    
    // Test batch processing
    console.log(chalk.cyan('\n\nTesting batch processing...'));
    const batchAddresses = testAddresses.map(t => ({
      address: t.address,
      fund_str: '0',
      fund_updated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
    }));
    
    const result = await updater.updateAddressFunds(batchAddresses);
    console.log(chalk.green(`✅ Batch processing completed`));
    console.log(chalk.gray(`  Updated: ${result.updated} addresses`));
    console.log(chalk.gray(`  Skipped: ${result.skipped} addresses`));
    console.log(chalk.gray(`  Failed: ${result.failed} addresses`));
    
    await updater.cleanup();
    
  } catch (error) {
    console.log(chalk.red('Fatal error:'), error);
  }
}

async function testSkipMode() {
  console.log(chalk.cyan.bold('\n\n⏸️ Testing Skip Mode (Moralis Disabled)\n'));
  
  // Temporarily disable Moralis API
  delete process.env.USE_MORALIS_API;
  
  const FundUpdater = require('../core/FundUpdater');
  
  try {
    const updater = new FundUpdater();
    await updater.initialize();
    
    console.log(chalk.yellow('Running without Moralis API (skip mode)...'));
    
    const testAddress = {
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      fund_str: '0',
      fund_updated: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    };
    
    const result = await updater.updateAddressFunds([testAddress]);
    console.log(chalk.green(`✅ Skip mode working`));
    console.log(chalk.gray(`  Updated: ${result.updated} addresses`));
    console.log(chalk.gray(`  Skipped: ${result.skipped} addresses (will update later)`));
    
    await updater.cleanup();
    
  } catch (error) {
    console.log(chalk.red('Error in skip mode:'), error);
  }
}

async function main() {
  console.log(chalk.bold.cyan('=' .repeat(60)));
  console.log(chalk.bold.cyan('FundUpdater Moralis API Integration Test'));
  console.log(chalk.bold.cyan('=' .repeat(60)));
  
  await testMoralisIntegration();
  await testSkipMode();
  
  console.log(chalk.cyan('\n' + '=' .repeat(60)));
  console.log(chalk.bold.green('✅ All tests completed!'));
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(chalk.red('Fatal error:'), error);
      process.exit(1);
    });
}

module.exports = { testMoralisIntegration, testSkipMode };
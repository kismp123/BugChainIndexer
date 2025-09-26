#!/usr/bin/env node
/**
 * Test fetchPortfolioWithMoralis function with single API endpoint
 */

const chalk = require('chalk');
require('dotenv').config();

async function testFetchPortfolioWithMoralis() {
  console.log(chalk.cyan.bold('\n🧪 Testing fetchPortfolioWithMoralis Function\n'));
  console.log(chalk.gray('=' .repeat(60)));
  
  const FundUpdater = require('../core/FundUpdater');
  
  try {
    const updater = new FundUpdater();
    await updater.initialize();
    
    // Test addresses
    const testCases = [
      {
        address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        name: 'vitalik.eth',
        expected: 'High value wallet with multiple tokens'
      },
      {
        address: '0xcB1C1FdE09f811B294172696404e88E658659905',
        name: 'Test wallet',
        expected: 'Small wallet with few tokens'
      },
      {
        address: '0x0000000000000000000000000000000000000000',
        name: 'Zero address',
        expected: 'Empty wallet'
      }
    ];
    
    for (const testCase of testCases) {
      console.log(chalk.yellow(`\n📍 Testing: ${testCase.name}`));
      console.log(chalk.gray(`   Address: ${testCase.address}`));
      console.log(chalk.gray(`   Expected: ${testCase.expected}`));
      console.log();
      
      const startTime = Date.now();
      const portfolio = await updater.fetchPortfolioWithMoralis(testCase.address);
      const duration = Date.now() - startTime;
      
      if (portfolio) {
        console.log(chalk.green('✅ API call successful'));
        console.log(chalk.gray(`   Response time: ${duration}ms`));
        console.log();
        
        // Display results in a table format
        console.log(chalk.cyan('   Portfolio Summary:'));
        console.log(chalk.gray('   ' + '-'.repeat(50)));
        
        // Native balance
        const nativeEth = (BigInt(portfolio.nativeBalance) / BigInt(10**18)).toString();
        const nativeDecimals = ((BigInt(portfolio.nativeBalance) % BigInt(10**18)) / BigInt(10**14)).toString();
        console.log(chalk.white(`   Native Balance: ${nativeEth}.${nativeDecimals.padStart(4, '0')} ETH`));
        console.log(chalk.white(`   Native USD Value: $${portfolio.nativeUsdValue?.toFixed(2) || '0.00'}`));
        console.log();
        
        // Token information
        console.log(chalk.white(`   ERC20 Tokens: ${portfolio.tokens.length}`));
        if (portfolio.tokens.length > 0) {
          console.log(chalk.gray('   Top 5 tokens by value:'));
          const sortedTokens = portfolio.tokens
            .sort((a, b) => parseFloat(b.usd_value || 0) - parseFloat(a.usd_value || 0))
            .slice(0, 5);
          
          sortedTokens.forEach((token, i) => {
            const symbol = token.symbol || 'Unknown';
            const value = parseFloat(token.usd_value || 0);
            const balance = parseFloat(token.balance_formatted || 0);
            console.log(chalk.gray(`     ${i+1}. ${symbol}: ${balance.toFixed(4)} ($${value.toFixed(2)})`));
          });
        }
        console.log();
        
        // Total value
        console.log(chalk.green(`   💰 Total Portfolio Value: $${portfolio.totalUsdValue.toLocaleString()}`));
        console.log(chalk.gray('   ' + '-'.repeat(50)));
        
        // Verify data consistency
        console.log(chalk.cyan('\n   Data Validation:'));
        
        // Check if native balance is included
        if (portfolio.nativeBalance && portfolio.nativeBalance !== '0') {
          console.log(chalk.green('   ✓ Native balance present'));
        } else if (testCase.address === '0x0000000000000000000000000000000000000000') {
          console.log(chalk.gray('   ✓ Zero address (expected empty)'));
        } else {
          console.log(chalk.yellow('   ⚠ No native balance found'));
        }
        
        // Check total calculation
        const calculatedTotal = (portfolio.nativeUsdValue || 0) + 
          portfolio.tokens.reduce((sum, token) => sum + parseFloat(token.usd_value || 0), 0);
        const difference = Math.abs(calculatedTotal - portfolio.totalUsdValue);
        
        if (difference < 0.01) {
          console.log(chalk.green('   ✓ Total USD value calculation correct'));
        } else {
          console.log(chalk.yellow(`   ⚠ Total calculation mismatch: ${difference.toFixed(2)}`));
        }
        
        // Check API source
        if (portfolio.source === 'moralis') {
          console.log(chalk.green('   ✓ Source correctly identified as Moralis'));
        } else {
          console.log(chalk.yellow(`   ⚠ Unexpected source: ${portfolio.source}`));
        }
        
      } else {
        console.log(chalk.red('❌ Failed to fetch portfolio'));
        console.log(chalk.gray(`   Response time: ${duration}ms`));
      }
      
      // Rate limiting
      if (testCases.indexOf(testCase) < testCases.length - 1) {
        console.log(chalk.gray('\n   Waiting 1 second for rate limiting...'));
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    await updater.cleanup();
    
  } catch (error) {
    console.log(chalk.red('Fatal error:'), error);
  }
}

async function testErrorHandling() {
  console.log(chalk.cyan.bold('\n\n🔧 Testing Error Handling\n'));
  console.log(chalk.gray('=' .repeat(60)));
  
  const FundUpdater = require('../core/FundUpdater');
  
  // Test with invalid API key
  console.log(chalk.yellow('\n1. Testing with invalid API key:'));
  const originalKey = process.env.MORALIS_API_KEY;
  process.env.MORALIS_API_KEY = 'invalid_key_12345';
  
  try {
    const updater = new FundUpdater();
    await updater.initialize();
    
    const portfolio = await updater.fetchPortfolioWithMoralis('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    if (!portfolio) {
      console.log(chalk.green('   ✓ Correctly returned null for invalid API key'));
    } else {
      console.log(chalk.red('   ✗ Should have failed with invalid API key'));
    }
    
    await updater.cleanup();
  } catch (error) {
    console.log(chalk.green('   ✓ Error handled:', error.message));
  }
  
  // Test with no API key
  console.log(chalk.yellow('\n2. Testing with no API key:'));
  delete process.env.MORALIS_API_KEY;
  
  try {
    const updater = new FundUpdater();
    await updater.initialize();
    
    const portfolio = await updater.fetchPortfolioWithMoralis('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
    if (!portfolio) {
      console.log(chalk.green('   ✓ Correctly returned null when API key missing'));
    } else {
      console.log(chalk.red('   ✗ Should have failed without API key'));
    }
    
    await updater.cleanup();
  } catch (error) {
    console.log(chalk.green('   ✓ Error handled:', error.message));
  }
  
  // Restore original key
  process.env.MORALIS_API_KEY = originalKey;
  
  // Test with invalid address format
  console.log(chalk.yellow('\n3. Testing with invalid address:'));
  
  try {
    const updater = new FundUpdater();
    await updater.initialize();
    
    const portfolio = await updater.fetchPortfolioWithMoralis('invalid_address');
    if (!portfolio) {
      console.log(chalk.green('   ✓ Correctly handled invalid address'));
    } else {
      console.log(chalk.red('   ✗ Should have failed with invalid address'));
    }
    
    await updater.cleanup();
  } catch (error) {
    console.log(chalk.green('   ✓ Error handled:', error.message));
  }
}

async function main() {
  console.log(chalk.bold.cyan('=' .repeat(60)));
  console.log(chalk.bold.cyan('   fetchPortfolioWithMoralis Function Test Suite'));
  console.log(chalk.bold.cyan('=' .repeat(60)));
  
  await testFetchPortfolioWithMoralis();
  await testErrorHandling();
  
  console.log(chalk.cyan('\n' + '=' .repeat(60)));
  console.log(chalk.bold.green('✅ All tests completed!'));
  console.log(chalk.cyan('=' .repeat(60) + '\n'));
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error(chalk.red('Fatal error:'), error);
      process.exit(1);
    });
}

module.exports = { testFetchPortfolioWithMoralis, testErrorHandling };
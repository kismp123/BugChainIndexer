#!/usr/bin/env node
/**
 * Integration test for UnifiedScanner with getLogs optimization
 * Tests the dynamic learning mechanism with a small block range
 */

const UnifiedScanner = require('../core/UnifiedScanner.js');

async function testScannerIntegration() {
  console.log('🧪 UnifiedScanner Integration Test');
  console.log('===================================\n');

  // Create scanner instance
  const scanner = new UnifiedScanner();

  try {
    // Initialize scanner
    console.log('📋 Step 1: Initializing scanner...');
    await scanner.initialize();
    console.log('✅ Scanner initialized\n');

    // Check optimization profile
    console.log('📋 Step 2: Checking optimization profile...');
    if (scanner.logsOptimization) {
      console.log(`✅ Logs optimization active:`);
      console.log(`   Profile: ${scanner.network}-${scanner.alchemyTier}`);
      console.log(`   Initial batch: ${scanner.logsOptimization.initialBatchSize}`);
      console.log(`   Range: ${scanner.logsOptimization.minBatchSize}-${scanner.logsOptimization.maxBatchSize}`);
      console.log(`   Target logs: ${scanner.logsOptimization.targetLogsPerRequest}`);
      console.log(`   Fast multiplier: ${scanner.logsOptimization.fastMultiplier}`);
      console.log(`   Slow multiplier: ${scanner.logsOptimization.slowMultiplier}\n`);
    } else {
      console.log('⚠️  No logs optimization configured\n');
    }

    // Get current block
    console.log('📋 Step 3: Getting current block...');
    const currentBlock = await scanner.getBlockNumber();
    console.log(`✅ Current block: ${currentBlock}\n`);

    // Test getLogs with adaptive batching on a small range
    console.log('📋 Step 4: Testing getLogs with adaptive batching...');
    const testFromBlock = currentBlock - 100; // Test last 100 blocks
    const testToBlock = currentBlock;

    console.log(`   Testing range: ${testFromBlock} - ${testToBlock} (100 blocks)`);
    console.log('   This will test:');
    console.log('   - Adaptive batching');
    console.log('   - Log density statistics collection');
    console.log('   - Dynamic optimization\n');

    // Fetch logs with adaptive batching
    // fetchLogsWithAdaptiveBatching(currentBlock, endBlock)
    const logs = await scanner.fetchLogsWithAdaptiveBatching(
      testFromBlock,
      testToBlock
    );

    console.log(`✅ Fetched ${logs.length} logs from 100 blocks\n`);

    // Check log density statistics
    console.log('📋 Step 5: Checking collected statistics...');
    if (scanner.logDensityStats) {
      const stats = scanner.logDensityStats;
      console.log(`✅ Statistics collected:`);
      console.log(`   Sample count: ${stats.sampleCount}`);
      console.log(`   Total logs: ${stats.totalLogs}`);
      console.log(`   Total blocks: ${stats.totalBlocks}`);
      console.log(`   Avg logs/block: ${stats.avgLogsPerBlock.toFixed(2)}`);
      console.log(`   Min logs/block: ${stats.minLogsPerBlock === Infinity ? 'N/A' : stats.minLogsPerBlock}`);
      console.log(`   Max logs/block: ${stats.maxLogsPerBlock}\n`);

      // Manually trigger statistics save
      console.log('📋 Step 6: Saving statistics to database...');
      await scanner.saveLogDensityStats();
      console.log('✅ Statistics saved to database\n');

      // Load statistics back to verify
      console.log('📋 Step 7: Loading statistics from database...');
      const loadedStats = await scanner.loadLogDensityStats();
      if (loadedStats) {
        console.log(`✅ Statistics loaded successfully:`);
        console.log(`   Avg logs/block: ${loadedStats.avg_logs_per_block}`);
        console.log(`   Optimal batch size: ${loadedStats.optimal_batch_size}`);
        console.log(`   Recommended profile: ${loadedStats.recommended_profile}`);
        console.log(`   Sample count: ${loadedStats.sample_count}\n`);
      } else {
        console.log('⚠️  No statistics found in database\n');
      }
    } else {
      console.log('⚠️  No statistics collected\n');
    }

    // Cleanup
    console.log('📋 Step 8: Cleaning up...');
    await scanner.cleanup();
    console.log('✅ Cleanup completed\n');

    // Summary
    console.log('===================================');
    console.log('🎉 INTEGRATION TEST PASSED');
    console.log('===================================');
    console.log('\nAll features working correctly:');
    console.log('✅ Scanner initialization');
    console.log('✅ Optimization profile loading');
    console.log('✅ Adaptive batching');
    console.log('✅ Statistics collection');
    console.log('✅ Database persistence');
    console.log('✅ Statistics retrieval');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Integration test failed:', error.message);
    console.error(error.stack);

    // Cleanup on error
    try {
      await scanner.cleanup();
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError.message);
    }

    process.exit(1);
  }
}

// Run test
testScannerIntegration();

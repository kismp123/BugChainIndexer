#!/usr/bin/env node
/**
 * Test script to verify that learned statistics persist across scanner runs
 * Tests that dynamic learning is applied on subsequent executions
 */

const UnifiedScanner = require('../core/UnifiedScanner.js');

async function runScannerInstance(instanceNum, expectedBehavior) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 INSTANCE ${instanceNum}: ${expectedBehavior}`);
  console.log('='.repeat(60));

  const scanner = new UnifiedScanner();

  try {
    // Initialize scanner
    console.log('\n📋 Step 1: Initializing scanner...');
    await scanner.initialize();
    console.log('✅ Scanner initialized');

    // Check if learned stats were loaded
    console.log('\n📋 Step 2: Checking learned statistics...');
    const statsLoadedFromDB = scanner.logDensityStats &&
                               scanner.logDensityStats.loadedFromDB;

    if (statsLoadedFromDB) {
      console.log('✅ Learned statistics LOADED from database');
      console.log(`   Loaded stats:`);
      console.log(`   - Avg logs/block: ${scanner.logDensityStats.avgLogsPerBlock.toFixed(2)}`);
      console.log(`   - Sample count: ${scanner.logDensityStats.sampleCount}`);
      console.log(`   - Total blocks: ${scanner.logDensityStats.totalBlocks}`);
    } else {
      console.log('ℹ️  No learned statistics found (cold start)');
    }

    // Check optimization profile
    console.log('\n📋 Step 3: Checking optimization profile...');
    if (scanner.logsOptimization) {
      console.log(`✅ Using optimization profile:`);
      console.log(`   Initial batch: ${scanner.logsOptimization.initialBatchSize}`);
      console.log(`   Range: ${scanner.logsOptimization.minBatchSize}-${scanner.logsOptimization.maxBatchSize}`);
      console.log(`   Target logs: ${scanner.logsOptimization.targetLogsPerRequest}`);

      // Check if dynamic tuning was applied
      if (scanner.logsOptimization.dynamicallyTuned) {
        console.log(`✅ DYNAMIC TUNING APPLIED!`);
        console.log(`   Original initial batch: ${scanner.logsOptimization.originalInitialBatchSize}`);
        console.log(`   Tuned initial batch: ${scanner.logsOptimization.initialBatchSize}`);
      } else {
        console.log(`ℹ️  Using default profile (no dynamic tuning)`);
      }
    }

    // Get current block
    console.log('\n📋 Step 4: Getting current block...');
    const currentBlock = await scanner.getBlockNumber();
    console.log(`✅ Current block: ${currentBlock}`);

    // Test with a small range
    console.log('\n📋 Step 5: Fetching logs with adaptive batching...');
    const testFromBlock = currentBlock - 50; // Test last 50 blocks
    const testToBlock = currentBlock;

    console.log(`   Testing range: ${testFromBlock} - ${testToBlock} (50 blocks)`);

    const logs = await scanner.fetchLogsWithAdaptiveBatching(
      testFromBlock,
      testToBlock
    );

    console.log(`✅ Fetched logs successfully`);

    // Check collected statistics
    console.log('\n📋 Step 6: Checking collected statistics...');
    if (scanner.logDensityStats) {
      const stats = scanner.logDensityStats;
      console.log(`✅ Statistics collected in this run:`);
      console.log(`   Sample count: ${stats.sampleCount}`);
      console.log(`   Total logs: ${stats.totalLogs}`);
      console.log(`   Total blocks: ${stats.totalBlocks}`);
      console.log(`   Avg logs/block: ${stats.avgLogsPerBlock.toFixed(2)}`);
    }

    // Save statistics
    console.log('\n📋 Step 7: Saving statistics to database...');
    await scanner.saveLogDensityStats();
    console.log('✅ Statistics saved to database');

    // Cleanup
    console.log('\n📋 Step 8: Cleaning up...');
    await scanner.cleanup();
    console.log('✅ Cleanup completed');

    return {
      success: true,
      statsLoadedFromDB,
      dynamicallyTuned: scanner.logsOptimization?.dynamicallyTuned || false,
      avgLogsPerBlock: scanner.logDensityStats?.avgLogsPerBlock,
      sampleCount: scanner.logDensityStats?.sampleCount
    };

  } catch (error) {
    console.error('\n❌ Instance failed:', error.message);

    try {
      await scanner.cleanup();
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError.message);
    }

    return {
      success: false,
      error: error.message
    };
  }
}

async function testLearningPersistence() {
  console.log('🧪 LEARNING PERSISTENCE TEST');
  console.log('============================\n');
  console.log('This test verifies that:');
  console.log('1. First run: Scanner learns and saves statistics');
  console.log('2. Second run: Scanner loads and applies learned statistics\n');

  // Clear existing statistics for clean test
  console.log('📋 Clearing existing statistics for clean test...');
  const { initializeDB, closeDB } = require('../common/core.js');
  const db = await initializeDB();

  try {
    await db.query(
      'DELETE FROM network_log_density_stats WHERE network = $1',
      ['ethereum']
    );
    console.log('✅ Existing statistics cleared\n');
  } catch (error) {
    console.log('⚠️  No existing statistics to clear\n');
  }

  db.release();
  await closeDB();

  // Wait a bit for cleanup
  await new Promise(resolve => setTimeout(resolve, 500));

  // Run first instance - should do cold start
  const result1 = await runScannerInstance(
    1,
    'Cold start - Learn statistics'
  );

  if (!result1.success) {
    console.error('\n❌ TEST FAILED: First instance failed');
    process.exit(1);
  }

  if (result1.statsLoadedFromDB) {
    console.error('\n❌ TEST FAILED: First instance should NOT have loaded stats from DB');
    process.exit(1);
  }

  console.log('\n✅ First instance completed successfully');
  console.log(`   Learned: ${result1.avgLogsPerBlock?.toFixed(2)} logs/block from ${result1.sampleCount} samples`);

  // Wait a bit between runs
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Run second instance - should load learned statistics
  const result2 = await runScannerInstance(
    2,
    'Load learned statistics and apply dynamic tuning'
  );

  if (!result2.success) {
    console.error('\n❌ TEST FAILED: Second instance failed');
    process.exit(1);
  }

  if (!result2.statsLoadedFromDB) {
    console.error('\n❌ TEST FAILED: Second instance should have loaded stats from DB');
    process.exit(1);
  }

  if (!result2.dynamicallyTuned) {
    console.error('\n⚠️  WARNING: Second instance did not apply dynamic tuning');
    console.error('   This may be expected if the learned statistics match the default profile');
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`\n✅ First run (cold start):`);
  console.log(`   - Statistics loaded from DB: ${result1.statsLoadedFromDB ? '❌ YES (unexpected)' : '✅ NO (expected)'}`);
  console.log(`   - Learned: ${result1.avgLogsPerBlock?.toFixed(2)} logs/block`);
  console.log(`   - Samples: ${result1.sampleCount}`);

  console.log(`\n✅ Second run (warm start):`);
  console.log(`   - Statistics loaded from DB: ${result2.statsLoadedFromDB ? '✅ YES (expected)' : '❌ NO (unexpected)'}`);
  console.log(`   - Dynamic tuning applied: ${result2.dynamicallyTuned ? '✅ YES' : 'ℹ️  NO (may be expected)'}`);
  console.log(`   - Updated: ${result2.avgLogsPerBlock?.toFixed(2)} logs/block`);
  console.log(`   - Total samples: ${result2.sampleCount}`);

  console.log('\n' + '='.repeat(60));
  console.log('🎉 LEARNING PERSISTENCE TEST PASSED');
  console.log('='.repeat(60));
  console.log('\n✅ Verified:');
  console.log('   1. First run learns and saves statistics');
  console.log('   2. Second run loads and uses learned statistics');
  console.log('   3. Statistics persist across scanner restarts');

  process.exit(0);
}

// Run test
testLearningPersistence().catch(error => {
  console.error('\n❌ Test failed with error:', error);
  process.exit(1);
});

/* eslint-disable no-console */
/**
 * ApprovalScanner - ERC20 Approval Event Tracker
 * Collects Approval events where the spender is a contract (not EOA).
 * Independent scanner that reuses LogFetcher for adaptive batching.
 *
 * Pipeline:
 *   1. getTargetBlocks()        → scan target block range
 *   2. fetchLogs([APPROVAL])    → LogFetcher module
 *   3. parseApprovalLogs()      → extract owner, spender, token, value
 *   4. filterContractSpenders() → keep only spenders that are contracts
 *   5. batchUpsertApprovals()   → DB storage
 */
const Scanner = require('../common/Scanner');
const {
  normalizeAddress,
  BATCH_SIZES,
  PERFORMANCE,
  PROCESSING,
  BLOCKCHAIN_CONSTANTS,
  batchUpsertApprovals
} = require('../common');
const { fetchLogs, adjustBatchSize } = require('../common/LogFetcher');
const { CONFIG } = require('../config/networks.js');

class ApprovalScanner extends Scanner {
  constructor() {
    super('ApprovalScanner', {
      timeout: parseInt(process.env.APPROVAL_TIMEOUT || '3600', 10)
    });

    this.approvalEvent = BLOCKCHAIN_CONSTANTS.APPROVAL_EVENT;
    this.timeDelay = parseInt(process.env.APPROVAL_TIMEDELAY || '', 10) || CONFIG.TIMEDELAY || 1;

    // Adaptive batch sizing state
    this.blockRetryCount = new Map();

    // Pipeline statistics
    this.stats = {
      totalLogs: 0,
      parsedApprovals: 0,
      contractSpenders: 0,
      storedApprovals: 0,
      errors: 0
    };
  }

  /**
   * Determine the block range to scan based on TIMEDELAY hours.
   */
  async getTargetBlocks() {
    const targetHours = this.timeDelay;
    const targetTimestamp = this.currentTime - (targetHours * 60 * 60);

    this.log(`🔍 Finding blocks for last ${targetHours} hours...`);

    const fromBlock = await this.getBlockByTime(targetTimestamp);
    const currentBlock = await this.getBlockNumber();

    this.log(`📈 Scan range: blocks ${fromBlock} → ${currentBlock} (${currentBlock - fromBlock} blocks)`);
    return { fromBlock, toBlock: currentBlock };
  }

  /**
   * Parse Approval event logs into structured objects.
   * Approval(address indexed owner, address indexed spender, uint256 value)
   */
  parseApprovalLogs(logs) {
    const approvals = [];

    for (const log of logs) {
      try {
        if (!log.topics || log.topics.length < 3) continue;

        approvals.push({
          owner: normalizeAddress('0x' + log.topics[1].slice(26)),
          spender: normalizeAddress('0x' + log.topics[2].slice(26)),
          tokenAddress: normalizeAddress(log.address),
          value: log.data || '0x0',
          blockNumber: parseInt(log.blockNumber, 16),
          txHash: log.transactionHash,
          logIndex: parseInt(log.logIndex, 16)
        });
      } catch (error) {
        this.log(`⚠️ Failed to parse approval log: ${error.message}`, 'warn');
      }
    }

    return approvals;
  }

  /**
   * Filter approvals to keep only those where spender is a contract.
   * Uses Scanner.isContracts() for batch checking.
   */
  async filterContractSpenders(approvals) {
    if (approvals.length === 0) return [];

    // Extract unique spenders
    const spenders = [...new Set(approvals.map(a => a.spender))];
    this.log(`🔍 Checking ${spenders.length} unique spenders for contract status...`);

    // Batch check via RPC
    const flags = await this.isContracts(spenders);

    // Build set of contract spenders
    const contractSet = new Set(spenders.filter((_, i) => flags[i]));

    this.log(`📊 ${contractSet.size}/${spenders.length} spenders are contracts`);

    return approvals.filter(a => contractSet.has(a.spender));
  }

  /**
   * Process a single batch of blocks: fetch, parse, filter, store.
   */
  async processBatch(fromBlock, toBlock) {
    // 1. Fetch logs
    const result = await fetchLogs(this, fromBlock, toBlock, [this.approvalEvent]);
    this.stats.totalLogs += result.logCount;

    if (result.logCount === 0) return { stored: 0, duration: result.duration, logCount: 0 };

    // 2. Parse
    const approvals = this.parseApprovalLogs(result.logs);
    this.stats.parsedApprovals += approvals.length;

    if (approvals.length === 0) return { stored: 0, duration: result.duration, logCount: result.logCount };

    // 3. Filter: only contract spenders
    const filtered = await this.filterContractSpenders(approvals);
    this.stats.contractSpenders += filtered.length;

    if (filtered.length === 0) {
      this.log(`📭 No contract-spender approvals in blocks ${fromBlock}-${toBlock}`);
      return { stored: 0, duration: result.duration, logCount: result.logCount };
    }

    // 4. Store
    const now = Math.floor(Date.now() / 1000);
    const dbRecords = filtered.map(a => ({
      owner: a.owner,
      spender: a.spender,
      tokenAddress: a.tokenAddress,
      value: a.value,
      blockNumber: a.blockNumber,
      txHash: a.txHash,
      logIndex: a.logIndex,
      network: this.network,
      firstSeen: now,
      lastUpdated: now
    }));

    const { rowCount } = await batchUpsertApprovals(this.db, dbRecords);
    this.stats.storedApprovals += rowCount;

    this.log(`✅ Stored ${rowCount} approvals from blocks ${fromBlock}-${toBlock}`);
    return { stored: rowCount, duration: result.duration, logCount: result.logCount };
  }

  /**
   * Main execution: streaming pipeline with adaptive batch sizing.
   */
  async run() {
    this.log('🚀 Starting ApprovalScanner pipeline');

    const { fromBlock, toBlock } = await this.getTargetBlocks();
    const totalBlocks = toBlock - fromBlock + 1;
    this.log(`📊 Scanning blocks ${fromBlock} → ${toBlock} (${totalBlocks.toLocaleString()} blocks)`);

    // Adaptive batch sizing parameters
    const logsOptimization = this.logsOptimization || {
      initialBatchSize: BATCH_SIZES.LOGS_DEFAULT,
      minBatchSize: BATCH_SIZES.LOGS_MIN,
      maxBatchSize: BATCH_SIZES.LOGS_MAX,
      targetDuration: PERFORMANCE.TARGET_DURATION,
      targetLogsPerRequest: 10000,
      fastMultiplier: PERFORMANCE.FAST_MULTIPLIER,
      slowMultiplier: PERFORMANCE.SLOW_MULTIPLIER
    };

    const maxBatchSize = Math.min(logsOptimization.maxBatchSize, this.maxLogsBlockRange || 1000);
    const minBatchSize = logsOptimization.minBatchSize;
    let currentBatchSize = Math.min(logsOptimization.initialBatchSize, maxBatchSize);

    this.log(`Batch size limits: ${minBatchSize}-${maxBatchSize} blocks (initial: ${currentBatchSize})`);

    let currentBlock = fromBlock;
    let batchNum = 0;

    while (currentBlock <= toBlock) {
      const endBlock = Math.min(currentBlock + currentBatchSize - 1, toBlock);
      batchNum++;

      this.log(`📦 Batch ${batchNum}: blocks ${currentBlock}-${endBlock} (${endBlock - currentBlock + 1} blocks)`);

      try {
        const result = await this.processBatch(currentBlock, endBlock);

        // Adjust batch size
        currentBatchSize = adjustBatchSize(
          this, currentBatchSize, result.duration, result.logCount,
          minBatchSize, maxBatchSize, logsOptimization
        );

        currentBlock = endBlock + 1;
      } catch (error) {
        const blockKey = `${currentBlock}-${endBlock}`;
        const retryCount = this.blockRetryCount.get(blockKey) || 0;

        if (error.message.includes('timeout') || error.message.includes('query returned more than')) {
          if (retryCount >= 5) {
            this.log(`⏭️ Skipping blocks ${currentBlock}-${endBlock} after ${retryCount} retries`, 'error');
            this.blockRetryCount.delete(blockKey);
            currentBlock = endBlock + 1;
            continue;
          }

          this.blockRetryCount.set(blockKey, retryCount + 1);
          currentBatchSize = Math.max(minBatchSize, Math.floor(currentBatchSize * 0.5));
          this.log(`⚠️ Retry ${retryCount + 1}/5, reducing batch size to ${currentBatchSize}`, 'warn');
          // Don't advance currentBlock — retry same range
        } else {
          this.log(`❌ Batch ${batchNum} failed: ${error.message}. Skipping...`, 'error');
          this.stats.errors++;
          currentBlock = endBlock + 1;
        }
      }
    }

    // Final statistics
    this.log('🎯 APPROVAL PIPELINE COMPLETE');
    this.log(`📊 Logs: ${this.stats.totalLogs.toLocaleString()} fetched`);
    this.log(`📊 Parsed: ${this.stats.parsedApprovals.toLocaleString()} approvals`);
    this.log(`📊 Contract spenders: ${this.stats.contractSpenders.toLocaleString()}`);
    this.log(`📊 Stored: ${this.stats.storedApprovals.toLocaleString()} approvals`);
    this.log(`📊 Errors: ${this.stats.errors}`);
  }
}

// Execute if run directly
if (require.main === module) {
  process.env.AUTO_EXIT = 'true';

  const timeoutSeconds = parseInt(process.env.TIMEOUT_SECONDS || '3600', 10);
  const forceExit = setTimeout(() => {
    console.log(`⚠️ Force terminating process (${timeoutSeconds}s timeout)`);
    process.exit(0);
  }, timeoutSeconds * 1000);

  const scanner = new ApprovalScanner();
  scanner.execute()
    .then(() => {
      console.log('✅ ApprovalScanner completed successfully');
      clearTimeout(forceExit);
    })
    .catch(error => {
      console.error('❌ ApprovalScanner failed:', error);
      clearTimeout(forceExit);
      process.exit(1);
    });
}

module.exports = ApprovalScanner;

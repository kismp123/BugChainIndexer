/**
 * LogFetcher - Reusable log fetching with adaptive batching
 * Extracted from UnifiedScanner for reuse by other scanners.
 * All functions take a Scanner instance as first argument.
 */
const { TIMEOUTS, withTimeoutAndRetry } = require('./core');

/**
 * Fetch logs with adaptive batching and timeout handling
 * @param {Scanner} scanner - Scanner instance (must have getLogs, log methods)
 * @param {number} fromBlock - Start block number
 * @param {number} toBlock - End block number
 * @param {string[]} topics - Event topic filters
 * @returns {{ logs: Array, duration: number, logCount: number }}
 */
async function fetchLogs(scanner, fromBlock, toBlock, topics) {
  const startTime = Date.now();
  scanner.log(`📥 Calling getLogs for blocks ${fromBlock}-${toBlock} (timeout: 20s)...`);

  try {
    const logs = await withTimeoutAndRetry(
      () => scanner.getLogs({
        fromBlock: `0x${fromBlock.toString(16)}`,
        toBlock: `0x${toBlock.toString(16)}`,
        topics
      }),
      TIMEOUTS.GET_LOGS,
      {
        operationName: `getLogs(${fromBlock}-${toBlock})`,
        maxAttempts: 2
      }
    );
    const duration = Date.now() - startTime;
    scanner.log(`✅ getLogs completed in ${duration}ms`);

    return { logs, duration, logCount: logs.length };
  } catch (error) {
    const duration = Date.now() - startTime;
    scanner.log(`❌ getLogs failed after ${duration}ms: ${error.message}`, 'error');
    throw error;
  }
}

/**
 * Adjust batch size based on response time and log count
 * @param {Scanner} scanner - Scanner instance for logging
 * @param {number} currentBatchSize - Current batch size
 * @param {number} duration - Response time in ms
 * @param {number} logCount - Number of logs returned
 * @param {number} minBatchSize - Minimum batch size
 * @param {number} maxBatchSize - Maximum batch size
 * @param {object} logsOptimization - Optimization config
 * @returns {number} New batch size
 */
function adjustBatchSize(scanner, currentBatchSize, duration, logCount, minBatchSize, maxBatchSize, logsOptimization) {
  const targetDuration = logsOptimization.targetDuration;
  const targetLogsPerRequest = logsOptimization.targetLogsPerRequest;
  const fastMultiplier = logsOptimization.fastMultiplier;
  const slowMultiplier = logsOptimization.slowMultiplier;

  // Fast response - increase aggressively
  if (duration < targetDuration / 3) {
    const newBatchSize = Math.min(maxBatchSize, Math.floor(currentBatchSize * fastMultiplier));
    if (newBatchSize > currentBatchSize) {
      scanner.log(`Fast response (${duration}ms, ${logCount} logs). Increasing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
      return newBatchSize;
    }
  }
  // Good response - increase moderately
  else if (duration < targetDuration) {
    const ratio = targetDuration / duration;
    const newBatchSize = Math.min(maxBatchSize, Math.floor(currentBatchSize * Math.min(ratio, 1.5)));
    if (newBatchSize > currentBatchSize * 1.2) {
      scanner.log(`Good response (${duration}ms, ${logCount} logs). Increasing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
      return newBatchSize;
    }
  }
  // Very slow response - reduce aggressively
  else if (duration > targetDuration * 3) {
    const newBatchSize = Math.max(minBatchSize, Math.floor(currentBatchSize * slowMultiplier));
    scanner.log(`Very slow response (${duration}ms, ${logCount} logs). Reducing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
    return newBatchSize;
  }
  // Slow response - reduce moderately
  else if (duration > targetDuration * 1.5) {
    const newBatchSize = Math.max(minBatchSize, Math.floor(currentBatchSize * slowMultiplier));
    if (newBatchSize < currentBatchSize * 0.8) {
      scanner.log(`Slow response (${duration}ms, ${logCount} logs). Reducing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
      return newBatchSize;
    }
  }

  // Also consider log count - if we're getting close to response size limit
  if (logCount > targetLogsPerRequest * 0.8 && currentBatchSize > minBatchSize) {
    const newBatchSize = Math.max(minBatchSize, Math.floor(currentBatchSize * 0.8));
    scanner.log(`High log count (${logCount} logs, target: ${targetLogsPerRequest}). Reducing batch size: ${currentBatchSize} → ${newBatchSize} blocks`);
    return newBatchSize;
  }

  return currentBatchSize;
}

module.exports = {
  fetchLogs,
  adjustBatchSize
};

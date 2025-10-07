/**
 * Chunk Size Optimizer - Learning-based adaptive chunk sizing
 * Learns from execution history to optimize chunk sizes per network
 */

const fs = require('fs').promises;
const path = require('path');

class ChunkSizeOptimizer {
  constructor(network, operationType = 'erc20') {
    this.network = network;
    this.operationType = operationType;
    this.dataDir = path.join(__dirname, '../data/chunk-history');
    this.historyFile = path.join(this.dataDir, `${network}-${operationType}.json`);

    // Current session data
    this.sessionData = {
      chunkSizes: [],
      socketErrors: 0,
      totalRequests: 0,
      successfulRequests: 0,
      durations: [],
      startTime: Date.now()
    };

    // Historical data
    this.history = [];
    this.currentLimits = null;

    // Load history asynchronously
    this.loadHistory().catch(err => {
      console.warn(`[ChunkOptimizer][${network}] Failed to load history: ${err.message}`);
    });
  }

  async loadHistory() {
    try {
      // Ensure data directory exists
      await fs.mkdir(this.dataDir, { recursive: true });

      // Try to read history file
      const data = await fs.readFile(this.historyFile, 'utf8');
      this.history = JSON.parse(data);

      console.log(`[ChunkOptimizer][${this.network}] Loaded ${this.history.length} historical records`);

      // Calculate optimal limits from history
      this.currentLimits = this.calculateOptimalLimits();

    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist yet - first run
        console.log(`[ChunkOptimizer][${this.network}] No history found, starting fresh`);
        this.history = [];
        this.currentLimits = this.getDefaultLimits();
      } else {
        console.error(`[ChunkOptimizer][${this.network}] Error loading history:`, error.message);
        this.history = [];
        this.currentLimits = this.getDefaultLimits();
      }
    }
  }

  getDefaultLimits() {
    // Operation-type-specific defaults based on gas costs
    const defaults = {
      'erc20': {
        // ~150k gas per holder, 900M / 150k = ~6,000 max
        initial: 100,
        max: 500,
        recommended: 250,
        confidence: 0
      },
      'native-balance': {
        // ~50k gas per address, 550M / 50k = ~11,000 max
        initial: 6000,
        max: 10000,
        recommended: 8000,
        confidence: 0
      },
      'contract-check': {
        // ~30k gas per address, 900M / 30k = ~30,000 max
        initial: 12000,
        max: 25000,
        recommended: 18000,
        confidence: 0
      },
      'codehash': {
        // ~100k gas per address, 900M / 100k = ~9,000 max
        initial: 5000,
        max: 8500,
        recommended: 6500,
        confidence: 0
      }
    };

    // Return operation-specific defaults, or conservative fallback
    return defaults[this.operationType] || {
      initial: 80,
      max: 300,
      recommended: 150,
      confidence: 0
    };
  }

  calculateOptimalLimits() {
    if (this.history.length === 0) {
      return this.getDefaultLimits();
    }

    // Filter recent history (last 20 runs)
    const recentHistory = this.history.slice(-20);

    // Find optimal chunk size based on:
    // 1. Low error rate (< 2%)
    // 2. Good performance (avg duration < 3s)
    // 3. High success rate (> 95%)
    // 4. Meaningful chunk sizes (ignore runs with small data sets)

    const goodRuns = recentHistory.filter(run => {
      const errorRate = run.socketErrors / run.totalRequests;
      const successRate = run.successfulRequests / run.totalRequests;
      const avgDuration = run.avgDuration;
      const maxChunkSize = run.maxChunkSize;

      // Ignore runs where maxChunkSize is too small (likely small test data)
      // Use 50% of default initial as threshold
      const defaults = this.getDefaultLimits();
      const minMeaningfulSize = defaults.initial * 0.5;

      return errorRate < 0.02 &&
             successRate > 0.95 &&
             avgDuration > 0 &&  // Ignore negative/zero durations
             avgDuration < 3000 &&
             maxChunkSize >= minMeaningfulSize;
    });

    if (goodRuns.length === 0) {
      // No good runs, use defaults
      console.log(`[ChunkOptimizer][${this.network}] No good historical runs found, using defaults`);
      return this.getDefaultLimits();
    }

    // Find the highest max chunk size from good runs
    const maxChunkSizes = goodRuns.map(run => run.maxChunkSize);
    const recommendedMax = Math.max(...maxChunkSizes);

    // Calculate average initial chunk size from good runs
    const avgInitial = Math.floor(
      goodRuns.reduce((sum, run) => sum + run.initialChunkSize, 0) / goodRuns.length
    );

    // Get defaults for fallback values
    const defaults = this.getDefaultLimits();

    // Calculate confidence based on data points
    const confidence = Math.min(goodRuns.length / 10, 1.0);

    const limits = {
      initial: Math.max(defaults.initial, avgInitial),
      max: Math.max(defaults.max, recommendedMax), // Use learned max if higher than default
      recommended: Math.floor(Math.max(defaults.max, recommendedMax) * 0.8),
      confidence: confidence,
      basedOnRuns: goodRuns.length
    };

    console.log(`[ChunkOptimizer][${this.network}] Calculated optimal limits:`, {
      initial: limits.initial,
      max: limits.max,
      confidence: `${(confidence * 100).toFixed(0)}%`,
      basedOnRuns: goodRuns.length
    });

    return limits;
  }

  recordChunkExecution(chunkSize, duration, success, isSocketError = false) {
    this.sessionData.totalRequests++;
    this.sessionData.durations.push(duration);
    this.sessionData.chunkSizes.push(chunkSize);

    if (success) {
      this.sessionData.successfulRequests++;

      // Real-time learning: Update max limit if we successfully used a larger chunk
      // Only update after we have some data (10+ requests) and good success rate (>90%)
      if (this.sessionData.totalRequests >= 10 && this.currentLimits) {
        const successRate = this.sessionData.successfulRequests / this.sessionData.totalRequests;
        const errorRate = this.sessionData.socketErrors / this.sessionData.totalRequests;

        // If success rate is high and error rate is low, allow increasing max
        if (successRate > 0.9 && errorRate < 0.05) {
          const currentMaxUsed = Math.max(...this.sessionData.chunkSizes);

          // If we've successfully used chunks near our current max, increase it
          if (currentMaxUsed >= this.currentLimits.max * 0.9 && currentMaxUsed > this.currentLimits.max) {
            const oldMax = this.currentLimits.max;
            this.currentLimits.max = Math.min(currentMaxUsed * 1.2, 50000); // Cap at 50k for safety
            this.currentLimits.recommended = Math.floor(this.currentLimits.max * 0.8);
            console.log(`[ChunkOptimizer][${this.network}] Learning: Increasing max based on success: ${oldMax} → ${this.currentLimits.max} (used: ${currentMaxUsed})`);
          }
        }
      }
    }

    if (isSocketError) {
      this.sessionData.socketErrors++;

      // Real-time adjustment: if error rate is high, reduce current max
      const errorRate = this.sessionData.socketErrors / this.sessionData.totalRequests;
      if (errorRate > 0.05 && this.currentLimits && this.sessionData.totalRequests > 10) {
        const oldMax = this.currentLimits.max;
        this.currentLimits.max = Math.max(100, Math.floor(this.currentLimits.max * 0.8));
        console.log(`[ChunkOptimizer][${this.network}] High error rate (${(errorRate*100).toFixed(1)}%), reducing max: ${oldMax} → ${this.currentLimits.max}`);
      }
    }
  }

  getLimits() {
    if (!this.currentLimits) {
      return this.getDefaultLimits();
    }
    return this.currentLimits;
  }

  async saveSession() {
    try {
      // Calculate session statistics
      const sessionStats = {
        network: this.network,
        operationType: this.operationType,
        timestamp: new Date().toISOString(),
        duration: Date.now() - this.sessionData.startTime,
        totalRequests: this.sessionData.totalRequests,
        successfulRequests: this.sessionData.successfulRequests,
        socketErrors: this.sessionData.socketErrors,
        errorRate: this.sessionData.totalRequests > 0
          ? this.sessionData.socketErrors / this.sessionData.totalRequests
          : 0,
        successRate: this.sessionData.totalRequests > 0
          ? this.sessionData.successfulRequests / this.sessionData.totalRequests
          : 0,
        avgDuration: this.sessionData.durations.length > 0
          ? this.sessionData.durations.reduce((a, b) => a + b, 0) / this.sessionData.durations.length
          : 0,
        minChunkSize: Math.min(...this.sessionData.chunkSizes),
        maxChunkSize: Math.max(...this.sessionData.chunkSizes),
        avgChunkSize: this.sessionData.chunkSizes.length > 0
          ? this.sessionData.chunkSizes.reduce((a, b) => a + b, 0) / this.sessionData.chunkSizes.length
          : 0,
        initialChunkSize: this.currentLimits?.initial || 100
      };

      // Add to history
      this.history.push(sessionStats);

      // Keep only last 50 records to prevent file bloat
      if (this.history.length > 50) {
        this.history = this.history.slice(-50);
      }

      // Ensure directory exists
      await fs.mkdir(this.dataDir, { recursive: true });

      // Save to file
      await fs.writeFile(
        this.historyFile,
        JSON.stringify(this.history, null, 2),
        'utf8'
      );

      console.log(`[ChunkOptimizer][${this.network}] Session saved:`, {
        requests: sessionStats.totalRequests,
        errorRate: `${(sessionStats.errorRate * 100).toFixed(2)}%`,
        avgChunkSize: Math.round(sessionStats.avgChunkSize)
      });

    } catch (error) {
      console.error(`[ChunkOptimizer][${this.network}] Failed to save session:`, error.message);
    }
  }

  getSessionStats() {
    return {
      totalRequests: this.sessionData.totalRequests,
      socketErrors: this.sessionData.socketErrors,
      errorRate: this.sessionData.totalRequests > 0
        ? (this.sessionData.socketErrors / this.sessionData.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      successRate: this.sessionData.totalRequests > 0
        ? (this.sessionData.successfulRequests / this.sessionData.totalRequests * 100).toFixed(2) + '%'
        : '0%'
    };
  }
}

module.exports = { ChunkSizeOptimizer };

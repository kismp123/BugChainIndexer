/**
 * Parallel Multi-Network Runner
 * Scan multiple networks in parallel
 *
 * Usage:
 *   node core/ParallelRunner.js approval       # Scan Approval events for all networks
 *   node core/ParallelRunner.js approval 4     # Limit concurrency (default: 8)
 */
const { spawn } = require('child_process');
const path = require('path');
const { NETWORKS } = require('../config/networks');

// Configuration
const MAX_CONCURRENT = parseInt(process.argv[3] || '8', 10);
const MODE = process.argv[2] || 'approval';

// Network priority (by TVL)
const NETWORK_PRIORITY = {
  // Tier 1: High TVL
  ethereum: 1, arbitrum: 1, base: 1, polygon: 1,
  // Tier 2: Medium TVL
  optimism: 2, gnosis: 2, zksync: 2, scroll: 2,
  // Tier 3: Others
};

class ParallelRunner {
  constructor() {
    this.networks = Object.keys(NETWORKS);
    this.results = new Map();
    this.running = 0;
    this.queue = [];
    this.startTime = Date.now();
  }

  log(message) {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`[${elapsed}s] ${message}`);
  }

  // Sort networks by priority
  getSortedNetworks() {
    return [...this.networks].sort((a, b) => {
      const priorityA = NETWORK_PRIORITY[a] || 3;
      const priorityB = NETWORK_PRIORITY[b] || 3;
      return priorityA - priorityB;
    });
  }

  // Run a single task
  runTask(network, type) {
    return new Promise((resolve) => {
      const scriptMap = {
        unified: 'UnifiedScanner.js'
      };
      const script = scriptMap[type];
      if (!script) {
        this.log(`❌ [${network}] Unknown task type: ${type}`);
        resolve({ network, type, success: false });
        return;
      }
      const scriptPath = path.join(__dirname, script);

      this.log(`🚀 [${network}] ${type} started`);

      const child = spawn('node', [scriptPath], {
        env: { ...process.env, NETWORK: network },
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', (code) => {
        const success = code === 0;
        const key = `${network}-${type}`;

        let summary = '';
        const match = output.match(/Processed (\d+)/);
        if (match) {
          summary = `${match[1]} processed`;
        }

        this.results.set(key, { success, summary });

        if (success) {
          this.log(`✅ [${network}] ${type} completed ${summary ? '- ' + summary : ''}`);
        } else {
          this.log(`❌ [${network}] ${type} failed`);
        }

        resolve({ network, type, success });
      });
    });
  }

  // Process next task from the queue
  async processQueue() {
    while (this.queue.length > 0 && this.running < MAX_CONCURRENT) {
      const task = this.queue.shift();
      this.running++;

      this.runTask(task.network, task.type).then(() => {
        this.running--;
        this.processQueue();
      });
    }
  }

  // Add all tasks to queue and start execution
  async run() {
    const networks = this.getSortedNetworks();

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Parallel Multi-Network Runner');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Mode: ${MODE}`);
    console.log(`  Networks: ${networks.length}`);
    console.log(`  Max Concurrent: ${MAX_CONCURRENT}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // Create tasks
    const tasks = [];
    for (const network of networks) {
      if (MODE === 'unified' || MODE === 'all') {
        tasks.push({ network, type: 'unified' });
      }
    }

    // Add to queue
    this.queue = tasks;
    const totalTasks = tasks.length;

    this.log(`📋 Starting ${totalTasks} tasks (${networks.length} networks)`);
    console.log('');

    // Start queue processing
    const promises = [];
    for (let i = 0; i < Math.min(MAX_CONCURRENT, this.queue.length); i++) {
      promises.push(this.processQueue());
    }

    // Wait for all tasks to complete
    while (this.running > 0 || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Print results
    this.printSummary();
  }

  printSummary() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Results');
    console.log('═══════════════════════════════════════════════════════');

    let successCount = 0;
    let failCount = 0;

    for (const [key, result] of this.results) {
      const [network, type] = key.split('-');
      const status = result.success ? '✅' : '❌';
      const summary = result.summary ? ` - ${result.summary}` : '';
      console.log(`  ${status} ${network.padEnd(12)} ${type.padEnd(10)}${summary}`);

      if (result.success) successCount++;
      else failCount++;
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Done: ${successCount} succeeded, ${failCount} failed`);
    console.log(`  Elapsed: ${elapsed}s`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
  }
}

// Execute
if (require.main === module) {
  if (!['unified', 'all'].includes(MODE)) {
    console.log('Usage: node ParallelRunner.js {unified|all} [concurrency]');
    console.log('');
    console.log('  unified  - Run UnifiedScanner (Transfer + Approval) for all networks');
    console.log('  all      - Run all tasks');
    console.log('');
    console.log('  concurrency - Max concurrent tasks (default: 8)');
    process.exit(1);
  }

  const runner = new ParallelRunner();
  runner.run().catch(console.error);
}

module.exports = ParallelRunner;

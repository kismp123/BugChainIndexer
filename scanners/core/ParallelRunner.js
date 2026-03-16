/**
 * Parallel Multi-Network Runner
 * 여러 네트워크를 병렬로 스캔
 *
 * 사용법:
 *   node core/ParallelRunner.js approval       # 모든 네트워크 Approval 스캔
 *   node core/ParallelRunner.js approval 4     # 동시 실행 수 제한 (기본: 8)
 */
const { spawn } = require('child_process');
const path = require('path');
const { NETWORKS } = require('../config/networks');

// 설정
const MAX_CONCURRENT = parseInt(process.argv[3] || '8', 10);
const MODE = process.argv[2] || 'approval';

// 네트워크 우선순위 (TVL 기준)
const NETWORK_PRIORITY = {
  // Tier 1: 높은 TVL
  ethereum: 1, arbitrum: 1, base: 1, polygon: 1,
  // Tier 2: 중간 TVL
  optimism: 2, gnosis: 2, zksync: 2, scroll: 2,
  // Tier 3: 나머지
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

  // 네트워크 우선순위로 정렬
  getSortedNetworks() {
    return [...this.networks].sort((a, b) => {
      const priorityA = NETWORK_PRIORITY[a] || 3;
      const priorityB = NETWORK_PRIORITY[b] || 3;
      return priorityA - priorityB;
    });
  }

  // 단일 작업 실행
  runTask(network, type) {
    return new Promise((resolve) => {
      const scriptMap = {
        approval: 'ApprovalScanner.js'
      };
      const script = scriptMap[type];
      if (!script) {
        this.log(`❌ [${network}] Unknown task type: ${type}`);
        resolve({ network, type, success: false });
        return;
      }
      const scriptPath = path.join(__dirname, script);

      this.log(`🚀 [${network}] ${type} 시작`);

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
          summary = `${match[1]}개 처리`;
        }

        this.results.set(key, { success, summary });

        if (success) {
          this.log(`✅ [${network}] ${type} 완료 ${summary ? '- ' + summary : ''}`);
        } else {
          this.log(`❌ [${network}] ${type} 실패`);
        }

        resolve({ network, type, success });
      });
    });
  }

  // 큐에서 다음 작업 실행
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

  // 모든 작업을 큐에 추가하고 실행
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

    // 작업 생성
    const tasks = [];
    for (const network of networks) {
      if (MODE === 'approval' || MODE === 'all') {
        tasks.push({ network, type: 'approval' });
      }
    }

    // 큐에 추가
    this.queue = tasks;
    const totalTasks = tasks.length;

    this.log(`📋 총 ${totalTasks}개 작업 시작 (${networks.length} 네트워크)`);
    console.log('');

    // 큐 처리 시작
    const promises = [];
    for (let i = 0; i < Math.min(MAX_CONCURRENT, this.queue.length); i++) {
      promises.push(this.processQueue());
    }

    // 모든 작업 완료 대기
    while (this.running > 0 || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 결과 출력
    this.printSummary();
  }

  printSummary() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  실행 결과');
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
    console.log(`  완료: ${successCount} 성공, ${failCount} 실패`);
    console.log(`  소요 시간: ${elapsed}초`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
  }
}

// 실행
if (require.main === module) {
  if (!['approval', 'all'].includes(MODE)) {
    console.log('Usage: node ParallelRunner.js {approval|all} [concurrency]');
    console.log('');
    console.log('  approval - Scan ERC20 Approval events for all networks');
    console.log('  all      - Run all tasks');
    console.log('');
    console.log('  concurrency - 동시 실행 수 (기본: 8)');
    process.exit(1);
  }

  const runner = new ParallelRunner();
  runner.run().catch(console.error);
}

module.exports = ParallelRunner;

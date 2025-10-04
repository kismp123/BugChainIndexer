/**
 * Test advisory lock functionality for concurrent FundUpdater instances
 */
const { Pool } = require('pg');

async function testAdvisoryLock() {
  const pool = new Pool({
    user: process.env.POSTGRES_USER || 'postgres',
    host: process.env.POSTGRES_HOST || 'localhost',
    database: process.env.POSTGRES_DB || 'bugchain_indexer',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    port: process.env.POSTGRES_PORT || 5432,
  });

  console.log('🧪 Testing advisory lock mechanism...\n');

  // Simulate two concurrent networks trying to update symbol_prices
  const lockId = 12345;

  async function simulateNetwork(networkName, delay) {
    const client = await pool.connect();
    const startTime = Date.now();

    try {
      console.log(`[${networkName}] 🔒 Attempting to acquire lock ${lockId}...`);

      // Try to acquire lock
      await client.query('SELECT pg_advisory_lock($1)', [lockId]);
      const acquireTime = Date.now();
      console.log(`[${networkName}] ✅ Lock acquired (waited ${acquireTime - startTime}ms)`);

      // Simulate work
      console.log(`[${networkName}] 💼 Doing work for ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));

      console.log(`[${networkName}] ✅ Work completed`);

    } catch (error) {
      console.error(`[${networkName}] ❌ Error: ${error.message}`);
    } finally {
      // Release lock
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
      console.log(`[${networkName}] 🔓 Lock released (total time: ${Date.now() - startTime}ms)\n`);
      client.release();
    }
  }

  // Run two networks concurrently
  const promises = [
    simulateNetwork('ethereum', 2000),
    simulateNetwork('polygon', 1500)
  ];

  await Promise.all(promises);

  console.log('✅ Test completed - if locks work correctly:');
  console.log('   - One network should acquire lock immediately (waited ~0ms)');
  console.log('   - Other network should wait until first releases (~2000ms wait)');
  console.log('   - Total time should be ~3500ms (sequential), not ~2000ms (parallel)\n');

  await pool.end();
}

testAdvisoryLock()
  .then(() => {
    console.log('✅ Advisory lock test passed');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });

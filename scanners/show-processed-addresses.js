const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/bugchain_indexer'
});

(async () => {
  try {
    const threeHoursAgo = Math.floor(Date.now() / 1000) - (3 * 60 * 60);

    console.log('='.repeat(100));
    console.log('DataRevalidator 처리된 주소 상세 데이터');
    console.log('='.repeat(100));
    console.log('');

    // EOA 샘플 (20개)
    console.log('📍 EOA (Externally Owned Account) 샘플:');
    console.log('-'.repeat(100));
    const eoas = await pool.query(
      `SELECT address, code_hash, deployed, tags, contract_name, name_checked, last_updated
       FROM addresses
       WHERE network = 'ethereum' AND last_updated > $1 AND 'EOA' = ANY(tags)
       ORDER BY last_updated DESC
       LIMIT 20`,
      [threeHoursAgo]
    );

    for (const row of eoas.rows) {
      console.log(`Address: ${row.address}`);
      console.log(`  Tags: ${JSON.stringify(row.tags)}`);
      console.log(`  Code Hash: ${row.code_hash || 'NULL (EOA has no code)'}`);
      console.log(`  Deployed: ${row.deployed || 'NULL (EOA not deployed)'}`);
      console.log(`  Contract Name: ${row.contract_name || 'NULL (Not a contract)'}`);
      console.log(`  Name Checked: ${row.name_checked}`);
      console.log(`  Last Updated: ${new Date(row.last_updated * 1000).toISOString()}`);
      console.log('');
    }

    console.log('');
    console.log('='.repeat(100));
    console.log('📦 Contract 샘플:');
    console.log('-'.repeat(100));

    // Contract 샘플 (20개)
    const contracts = await pool.query(
      `SELECT address, code_hash, deployed, tags, contract_name, name_checked, last_updated
       FROM addresses
       WHERE network = 'ethereum' AND last_updated > $1 AND 'Contract' = ANY(tags)
       ORDER BY last_updated DESC
       LIMIT 20`,
      [threeHoursAgo]
    );

    for (const row of contracts.rows) {
      console.log(`Address: ${row.address}`);
      console.log(`  Tags: ${JSON.stringify(row.tags)}`);
      console.log(`  Code Hash: ${row.code_hash}`);
      console.log(`  Deployed: ${row.deployed ? new Date(row.deployed * 1000).toISOString() : 'NULL'} (${row.deployed || 'NULL'})`);
      console.log(`  Contract Name: ${row.contract_name || 'NULL (Unverified)'}`);
      console.log(`  Name Checked: ${row.name_checked}`);
      console.log(`  Last Updated: ${new Date(row.last_updated * 1000).toISOString()}`);
      console.log('');
    }

    console.log('');
    console.log('='.repeat(100));
    console.log('📊 통계 요약:');
    console.log('-'.repeat(100));

    // 전체 통계
    const stats = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE 'EOA' = ANY(tags)) as eoa_count,
        COUNT(*) FILTER (WHERE 'Contract' = ANY(tags)) as contract_count,
        COUNT(*) FILTER (WHERE 'Verified' = ANY(tags)) as verified_count,
        COUNT(*) FILTER (WHERE 'Unverified' = ANY(tags)) as unverified_count,
        COUNT(*) FILTER (WHERE 'SelfDestroyed' = ANY(tags)) as selfdestructed_count,
        COUNT(*) as total
       FROM addresses
       WHERE network = 'ethereum' AND last_updated > $1`,
      [threeHoursAgo]
    );

    const s = stats.rows[0];
    console.log(`총 처리된 주소: ${s.total}개`);
    console.log(`  - EOA: ${s.eoa_count}개 (${(s.eoa_count / s.total * 100).toFixed(2)}%)`);
    console.log(`  - Contract: ${s.contract_count}개 (${(s.contract_count / s.total * 100).toFixed(2)}%)`);
    console.log(`    • Verified: ${s.verified_count}개 (${(s.verified_count / s.contract_count * 100).toFixed(2)}% of contracts)`);
    console.log(`    • Unverified: ${s.unverified_count}개 (${(s.unverified_count / s.contract_count * 100).toFixed(2)}% of contracts)`);
    console.log(`  - Self-Destroyed: ${s.selfdestructed_count}개`);

    console.log('');
    console.log('='.repeat(100));
    console.log('🔍 Verified Contract 샘플 (이름이 있는 컨트랙트):');
    console.log('-'.repeat(100));

    // Verified contracts with names
    const verifiedContracts = await pool.query(
      `SELECT address, code_hash, deployed, tags, contract_name, name_checked, last_updated
       FROM addresses
       WHERE network = 'ethereum'
         AND last_updated > $1
         AND 'Verified' = ANY(tags)
         AND contract_name IS NOT NULL
       ORDER BY last_updated DESC
       LIMIT 10`,
      [threeHoursAgo]
    );

    if (verifiedContracts.rows.length > 0) {
      for (const row of verifiedContracts.rows) {
        console.log(`Address: ${row.address}`);
        console.log(`  Contract Name: ${row.contract_name}`);
        console.log(`  Tags: ${JSON.stringify(row.tags)}`);
        console.log(`  Code Hash: ${row.code_hash}`);
        console.log(`  Deployed: ${row.deployed ? new Date(row.deployed * 1000).toISOString() : 'NULL'}`);
        console.log(`  Last Updated: ${new Date(row.last_updated * 1000).toISOString()}`);
        console.log('');
      }
    } else {
      console.log('(검증된 컨트랙트 없음)');
      console.log('');
    }

    console.log('='.repeat(100));
    console.log('✅ 데이터 조회 완료');
    console.log('='.repeat(100));

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();

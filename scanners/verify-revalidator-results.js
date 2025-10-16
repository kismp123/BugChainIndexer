const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/bugchain_indexer'
});

(async () => {
  try {
    const threeHoursAgo = Math.floor(Date.now() / 1000) - (3 * 60 * 60);
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;

    console.log('='.repeat(100));
    console.log('DataRevalidator 처리 결과 검증');
    console.log('='.repeat(100));
    console.log(`현재 시간: ${new Date().toISOString()} (Unix: ${Math.floor(Date.now() / 1000)})`);
    console.log(`3시간 전: ${new Date(threeHoursAgo * 1000).toISOString()} (Unix: ${threeHoursAgo})`);
    console.log('');

    // 최근 3시간 내 업데이트 카운트
    const count3h = await pool.query(
      `SELECT COUNT(*) as total FROM addresses WHERE network = 'ethereum' AND last_updated > $1`,
      [threeHoursAgo]
    );
    console.log(`✅ 최근 3시간 내 업데이트된 주소: ${count3h.rows[0].total}개`);

    // 최근 5분 내 업데이트 카운트
    const count5m = await pool.query(
      `SELECT COUNT(*) as total FROM addresses WHERE network = 'ethereum' AND last_updated > $1`,
      [fiveMinutesAgo]
    );
    console.log(`✅ 최근 5분 내 업데이트된 주소: ${count5m.rows[0].total}개`);
    console.log('');

    // 최근 3시간 내 업데이트 샘플 (20개)
    const samples = await pool.query(
      `SELECT address, code_hash, deployed, tags, contract_name, name_checked, last_updated
       FROM addresses
       WHERE network = 'ethereum' AND last_updated > $1
       ORDER BY last_updated DESC
       LIMIT 20`,
      [threeHoursAgo]
    );

    console.log('='.repeat(100));
    console.log('최근 업데이트 샘플 (20개):');
    console.log('='.repeat(100));
    console.log('');

    for (const row of samples.rows) {
      console.log(`Address: ${row.address}`);
      console.log(`  code_hash: ${row.code_hash || 'NULL'}`);
      console.log(`  deployed: ${row.deployed || 'NULL'} ${row.deployed ? `(${new Date(row.deployed * 1000).toISOString()})` : ''}`);
      console.log(`  tags: ${JSON.stringify(row.tags)}`);
      console.log(`  contract_name: ${row.contract_name || 'NULL'}`);
      console.log(`  name_checked: ${row.name_checked}`);
      console.log(`  last_updated: ${row.last_updated} (${new Date(row.last_updated * 1000).toISOString()})`);
      console.log('');
    }

    // 태그 분류별 통계
    console.log('='.repeat(100));
    console.log('최근 3시간 내 업데이트 - 태그별 통계:');
    console.log('='.repeat(100));

    const tagStats = await pool.query(
      `SELECT
        CASE
          WHEN 'EOA' = ANY(tags) THEN 'EOA'
          WHEN 'Contract' = ANY(tags) THEN 'Contract'
          WHEN 'SelfDestroyed' = ANY(tags) THEN 'SelfDestroyed'
          ELSE 'Other'
        END as tag_type,
        COUNT(*) as count
       FROM addresses
       WHERE network = 'ethereum' AND last_updated > $1
       GROUP BY tag_type
       ORDER BY count DESC`,
      [threeHoursAgo]
    );

    for (const row of tagStats.rows) {
      console.log(`  ${row.tag_type}: ${row.count}개`);
    }

    console.log('');
    console.log('='.repeat(100));
    console.log('검증 완료');
    console.log('='.repeat(100));

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();

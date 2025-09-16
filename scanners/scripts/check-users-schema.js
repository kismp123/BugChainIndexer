#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Users 테이블 스키마 확인 스크립트
 */

const { Client } = require('pg');

// 환경변수에서 DATABASE_URL 가져오기
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:@localhost:5432/bugchain_indexer";

async function checkUsersSchema() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스에 연결되었습니다');

    // users 테이블 스키마 확인
    console.log('\n📋 users 테이블 스키마:');
    const usersSchema = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    usersSchema.rows.forEach(row => {
      console.log(`  ${row.column_name} (${row.data_type}${row.is_nullable === 'NO' ? ', NOT NULL' : ''})`);
    });

    // 샘플 데이터 확인
    console.log('\n📊 users 테이블 샘플 데이터 (5개):');
    const sampleUsers = await client.query('SELECT * FROM users LIMIT 5');
    console.table(sampleUsers.rows);

    console.log('\n📊 users 테이블 통계:');
    const userStats = await client.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(DISTINCT network) as networks_count,
        MIN(last_updated) as earliest_update,
        MAX(last_updated) as latest_update
      FROM users
    `);
    console.table(userStats.rows[0]);

    console.log('\n📊 네트워크별 users 개수:');
    const networkStats = await client.query(`
      SELECT network, COUNT(*) as count 
      FROM users 
      GROUP BY network 
      ORDER BY count DESC
    `);
    console.table(networkStats.rows);
    
  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    await client.end();
  }
}

// 스크립트 실행
if (require.main === module) {
  console.log('🔍 users 테이블 스키마 확인 시작\n');
  checkUsersSchema().catch(console.error);
}

module.exports = { checkUsersSchema };
#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Manual Migration Script: users -> addresses
 * Move existing users table data to addresses table
 */

const { Client } = require('pg');

// Get DATABASE_URL from environment variables
const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:@localhost:5432/bugchain_indexer";

async function migrateUsersToAddresses() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ 데이터베이스에 연결되었습니다');

    // Step 1: users 테이블 확인
    console.log('\n🔍 users 테이블 확인 중...');
    const usersTableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'users'
      )
    `);
    
    if (!usersTableCheck.rows[0].exists) {
      console.log('❌ users 테이블이 존재하지 않습니다.');
      return;
    }

    const usersCount = await client.query('SELECT COUNT(*) FROM users');
    console.log(`📊 users 테이블에 ${usersCount.rows[0].count}개의 레코드가 있습니다`);

    // Step 2: addresses 테이블 확인 및 필요한 컬럼 추가
    console.log('\n🔍 addresses 테이블 스키마 확인 중...');
    const addressesSchema = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = 'addresses'
      ORDER BY ordinal_position
    `);

    console.log('현재 addresses 테이블 컬럼:');
    const columnNames = [];
    addressesSchema.rows.forEach(row => {
      columnNames.push(row.column_name);
      console.log(`  ${row.column_name} (${row.data_type})`);
    });

    // 필요한 컬럼들이 있는지 확인하고 없으면 추가
    const requiredColumns = [
      { name: 'first_seen', type: 'BIGINT', default: '0' },
      { name: 'tags', type: 'TEXT[]', default: "'{}'::TEXT[]" },
      { name: 'fund', type: 'BIGINT', default: '0' },
      { name: 'last_fund_updated', type: 'BIGINT', default: '0' }
    ];

    console.log('\n📝 필요한 컬럼 확인 및 추가...');
    for (const col of requiredColumns) {
      if (!columnNames.includes(col.name)) {
        await client.query(`ALTER TABLE addresses ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.default}`);
        console.log(`✅ ${col.name} 컬럼 추가됨`);
      } else {
        console.log(`✓ ${col.name} 컬럼 이미 존재함`);
      }
    }

    // Step 3: 백업 생성
    console.log('\n💾 백업 테이블 생성 중...');
    await client.query('DROP TABLE IF EXISTS users_backup');
    await client.query('CREATE TABLE users_backup AS SELECT * FROM users');
    console.log('✅ users_backup 테이블 생성 완료');

    await client.query('DROP TABLE IF EXISTS addresses_backup');
    await client.query('CREATE TABLE addresses_backup AS SELECT * FROM addresses');
    console.log('✅ addresses_backup 테이블 생성 완료');

    // Step 4: users 데이터를 addresses로 마이그레이션
    console.log('\n🚀 users 데이터를 addresses로 마이그레이션 중...');
    
    const currentTime = Math.floor(Date.now() / 1000);
    
    const migrationResult = await client.query(`
      INSERT INTO addresses (
        address, 
        network, 
        first_seen, 
        last_updated,
        code_hash,
        contract_name,
        deployed,
        tags,
        fund,
        last_fund_updated,
        name_checked,
        name_checked_at
      )
      SELECT 
        u.address,
        u.network,
        ${currentTime} as first_seen,
        ${currentTime} as last_updated,
        NULL as code_hash,
        NULL as contract_name,
        NULL as deployed,
        ARRAY['EOA']::TEXT[] as tags,
        0 as fund,
        0 as last_fund_updated,
        false as name_checked,
        0 as name_checked_at
      FROM users u
      ON CONFLICT (address, network) DO UPDATE SET
        tags = CASE 
          WHEN 'EOA' = ANY(addresses.tags) THEN addresses.tags
          ELSE array_append(addresses.tags, 'EOA')
        END
    `);

    console.log(`✅ ${migrationResult.rowCount}개의 users 레코드가 addresses로 마이그레이션되었습니다`);

    // Step 5: 결과 확인
    console.log('\n🔍 마이그레이션 결과 확인...');
    const finalAddressCount = await client.query('SELECT COUNT(*) FROM addresses');
    console.log(`📊 addresses 테이블 총 레코드: ${finalAddressCount.rows[0].count}`);

    const eoaCount = await client.query(`SELECT COUNT(*) FROM addresses WHERE 'EOA' = ANY(tags)`);
    console.log(`📊 EOA 태그가 있는 주소: ${eoaCount.rows[0].count}`);

    const networkCounts = await client.query(`
      SELECT network, COUNT(*) as count 
      FROM addresses 
      WHERE 'EOA' = ANY(tags) 
      GROUP BY network 
      ORDER BY count DESC
    `);
    
    console.log('📊 네트워크별 EOA 개수:');
    networkCounts.rows.forEach(row => {
      console.log(`   ${row.network}: ${row.count}`);
    });

    // Step 6: users 테이블 삭제 확인
    console.log('\n❓ users 테이블을 삭제하시겠습니까? (마이그레이션이 성공한 것을 확인한 후)');
    console.log('💡 수동으로 다음 명령어를 실행하여 삭제할 수 있습니다:');
    console.log('   DROP TABLE users;');
    console.log('💾 백업은 users_backup 테이블에 보관되어 있습니다.');

    console.log('\n✅ 마이그레이션이 성공적으로 완료되었습니다!');
    
  } catch (error) {
    console.error('❌ 마이그레이션 중 오류 발생:', error);
    console.error('💾 백업 테이블들이 생성되어 있으니 복구가 가능합니다.');
  } finally {
    await client.end();
  }
}

// 스크립트 실행
if (require.main === module) {
  console.log('🚀 users -> addresses 마이그레이션 시작');
  console.log('⚠️  진행하기 전에 데이터베이스 백업을 확인하세요!\n');
  
  migrateUsersToAddresses().catch(console.error);
}

module.exports = { migrateUsersToAddresses };
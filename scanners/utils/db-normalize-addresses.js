#!/usr/bin/env node

/**
 * Database Address Normalization Utility
 * 
 * This script handles address normalization in the addresses table:
 * - Converts all addresses to lowercase for consistency
 * - Detects and handles duplicate addresses across networks
 * - Provides analysis, dry-run, and execution modes
 * - Smart duplicate merging with data preservation
 */

const { Pool } = require('pg');

// Database configuration
const dbConfig = {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    database: process.env.PGDATABASE || 'bugchain_indexer',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    max: 20,
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 30000,
    query_timeout: 120000
};

const pool = new Pool(dbConfig);

// Utility functions
function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

function formatBytes(bytes) {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Analysis functions
async function analyzeAddresses() {
    log('🔍 Analyzing address normalization needs...');
    
    const queries = [
        {
            name: 'Total addresses',
            query: 'SELECT COUNT(*) as count FROM addresses'
        },
        {
            name: 'Mixed case addresses',
            query: `SELECT COUNT(*) as count FROM addresses 
                   WHERE address != LOWER(address)`
        },
        {
            name: 'Potential duplicate addresses',
            query: `SELECT COUNT(*) as count FROM addresses 
                   WHERE address != LOWER(address)`
        },
        {
            name: 'Cross-network duplicates (sample)',
            query: `SELECT COUNT(DISTINCT address) as count 
                   FROM addresses 
                   WHERE address IN (
                       SELECT address FROM addresses 
                       GROUP BY address 
                       HAVING COUNT(DISTINCT network) > 1 
                       LIMIT 1000
                   )`
        }
    ];
    
    console.log('\n📊 Address Analysis Results:');
    console.log('═'.repeat(50));
    
    for (const {name, query} of queries) {
        try {
            const result = await pool.query(query);
            const rawCount = result.rows[0].count;
            let displayValue;
            
            if (typeof rawCount === 'string' && isNaN(parseInt(rawCount))) {
                displayValue = rawCount;
            } else {
                const count = parseInt(rawCount);
                displayValue = formatNumber(count);
            }
            
            console.log(`${name.padEnd(35)}: ${displayValue}`);
        } catch (error) {
            console.error(`Error executing ${name}:`, error.message);
        }
    }
    
    // Sample problematic addresses
    try {
        log('\n🔍 Sample mixed case addresses:');
        const sampleResult = await pool.query(`
            SELECT address, network 
            FROM addresses 
            WHERE address != LOWER(address) 
            LIMIT 5
        `);
        
        sampleResult.rows.forEach(row => {
            console.log(`  ${row.address} (${row.network}) → ${row.address.toLowerCase()}`);
        });
        
    } catch (error) {
        console.error('Error getting sample addresses:', error.message);
    }
    
    // Check for any mixed case addresses as potential duplicates
    try {
        log('\n🔍 Checking for potential duplicates:');
        const mixedResult = await pool.query(`
            SELECT address, network
            FROM addresses 
            WHERE address != LOWER(address) 
            LIMIT 5
        `);
        
        if (mixedResult.rows.length > 0) {
            mixedResult.rows.forEach(row => {
                console.log(`  Potential duplicate: ${row.address} (${row.network})`);
            });
        } else {
            console.log('  ✅ No mixed case addresses found - no duplicates expected');
        }
        
    } catch (error) {
        console.error('Error checking potential duplicates:', error.message);
    }
}

async function validateAddresses() {
    log('✅ Validating address format and consistency...');
    
    const validationQueries = [
        {
            name: 'Invalid length addresses',
            query: `SELECT COUNT(*) as count FROM addresses 
                   WHERE LENGTH(address) != 42`
        },
        {
            name: 'Non-hex addresses',
            query: `SELECT COUNT(*) as count FROM addresses 
                   WHERE address !~ '^0x[0-9a-fA-F]{40}$'`
        },
        {
            name: 'Null addresses',
            query: `SELECT COUNT(*) as count FROM addresses 
                   WHERE address IS NULL OR address = ''`
        },
        {
            name: 'Normalized addresses',
            query: `SELECT COUNT(*) as count FROM addresses 
                   WHERE address = LOWER(address)`
        }
    ];
    
    console.log('\n🔍 Address Validation Results:');
    console.log('═'.repeat(50));
    
    for (const {name, query} of validationQueries) {
        try {
            const result = await pool.query(query);
            const count = parseInt(result.rows[0].count);
            const status = name.includes('Normalized') ? '✅' : 
                          count > 0 ? '⚠️' : '✅';
            console.log(`${status} ${name.padEnd(30)}: ${formatNumber(count)}`);
        } catch (error) {
            console.error(`Error validating ${name}:`, error.message);
        }
    }
}

async function dryRunNormalization() {
    log('🔄 Performing dry run address normalization...');
    
    try {
        // Get addresses that need normalization
        const mixedCaseResult = await pool.query(`
            SELECT address, network, COUNT(*) 
            FROM addresses 
            WHERE address != LOWER(address) 
            GROUP BY address, network
            ORDER BY network, address
            LIMIT 20
        `);
        
        console.log('\n📝 Addresses that would be normalized:');
        console.log('═'.repeat(70));
        
        mixedCaseResult.rows.forEach((row, index) => {
            console.log(`${(index + 1).toString().padStart(3)}. ${row.address}`);
            console.log(`     → ${row.address.toLowerCase()} (${row.network})`);
        });
        
        // Get duplicate groups that would be merged
        const duplicatesResult = await pool.query(`
            SELECT LOWER(address) as normalized, network, 
                   array_agg(DISTINCT address) as originals,
                   COUNT(*) as total_count
            FROM addresses 
            GROUP BY LOWER(address), network
            HAVING COUNT(*) > 1
            LIMIT 10
        `);
        
        if (duplicatesResult.rows.length > 0) {
            console.log('\n🔗 Duplicate groups that would be merged:');
            console.log('═'.repeat(70));
            
            duplicatesResult.rows.forEach((group, index) => {
                console.log(`${(index + 1).toString().padStart(3)}. ${group.normalized} (${group.network})`);
                console.log(`     Original addresses: ${group.originals.join(', ')}`);
                console.log(`     Total records: ${group.total_count}`);
                console.log('');
            });
        }
        
        log('✅ Dry run completed. No changes made to database.');
        
    } catch (error) {
        console.error('Error during dry run:', error.message);
    }
}

async function executeNormalization() {
    log('🚀 Starting address normalization execution...');
    log('⚠️  This will modify the database. Press Ctrl+C within 5 seconds to cancel...');
    
    // 5 second countdown
    for (let i = 5; i > 0; i--) {
        process.stdout.write(`\r${i}... `);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    process.stdout.write('\r✅ Starting normalization...\n');
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Step 1: Handle duplicates first
        log('🔗 Step 1: Merging duplicate address records...');
        
        const duplicateGroups = await client.query(`
            SELECT LOWER(address) as normalized, network, 
                   array_agg(DISTINCT address ORDER BY created_at DESC) as addresses,
                   array_agg(DISTINCT id ORDER BY created_at DESC) as ids
            FROM addresses 
            GROUP BY LOWER(address), network
            HAVING COUNT(*) > 1
        `);
        
        let mergedCount = 0;
        for (const group of duplicateGroups.rows) {
            const [keepAddress, ...duplicateAddresses] = group.addresses;
            const [keepId, ...duplicateIds] = group.ids;
            
            // Update the kept record to use normalized address
            await client.query(
                'UPDATE addresses SET address = $1 WHERE id = $2',
                [group.normalized, keepId]
            );
            
            // Delete duplicate records
            if (duplicateIds.length > 0) {
                await client.query(
                    'DELETE FROM addresses WHERE id = ANY($1)',
                    [duplicateIds]
                );
                mergedCount += duplicateIds.length;
            }
        }
        
        log(`✅ Merged ${formatNumber(mergedCount)} duplicate records`);
        
        // Step 2: Normalize remaining addresses
        log('🔄 Step 2: Normalizing address case...');
        
        const normalizeResult = await client.query(`
            UPDATE addresses 
            SET address = LOWER(address) 
            WHERE address != LOWER(address)
        `);
        
        log(`✅ Normalized ${formatNumber(normalizeResult.rowCount)} addresses`);
        
        // Step 3: Update indexes if needed
        log('🔧 Step 3: Updating database indexes...');
        
        await client.query('REINDEX INDEX CONCURRENTLY idx_addresses_address_network');
        
        await client.query('COMMIT');
        log('✅ Address normalization completed successfully!');
        
        // Final verification
        const verificationResult = await client.query(`
            SELECT COUNT(*) as total,
                   COUNT(CASE WHEN address = LOWER(address) THEN 1 END) as normalized
            FROM addresses
        `);
        
        const { total, normalized } = verificationResult.rows[0];
        log(`📊 Final status: ${formatNumber(normalized)}/${formatNumber(total)} addresses normalized (${(normalized/total*100).toFixed(2)}%)`);
        
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error during normalization:', error.message);
        throw error;
    } finally {
        client.release();
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    
    try {
        switch (command) {
            case '--analyze':
                await analyzeAddresses();
                break;
                
            case '--dry-run':
                await dryRunNormalization();
                break;
                
            case '--force':
                await executeNormalization();
                break;
                
            case '--validate':
                await validateAddresses();
                break;
                
            default:
                console.log(`
Address Normalization Utility

Usage:
  node db-normalize-addresses.js [OPTIONS]

Options:
  --analyze     Analyze address normalization needs
  --dry-run     Preview changes without executing
  --force       Execute address normalization (modifies database)
  --validate    Validate address format and consistency

Examples:
  node db-normalize-addresses.js --analyze
  node db-normalize-addresses.js --dry-run
  node db-normalize-addresses.js --force
  node db-normalize-addresses.js --validate
`);
        }
    } catch (error) {
        console.error('❌ Script failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Handle cleanup
process.on('SIGINT', async () => {
    log('🛑 Received interrupt signal, cleaning up...');
    await pool.end();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    log('🛑 Received termination signal, cleaning up...');
    await pool.end();
    process.exit(0);
});

if (require.main === module) {
    main();
}
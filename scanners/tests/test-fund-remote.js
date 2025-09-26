// Test script to debug FundUpdater on remote server
const FundUpdater = require('../core/FundUpdater');

async function testFundUpdater() {
    console.log('🔍 Testing FundUpdater execution...');
    
    // Set test environment
    process.env.NETWORK = 'ethereum';
    process.env.HIGH_FUND_FLAG = 'true';
    process.env.ALL_FLAG = 'true';
    process.env.FUND_UPDATE_MAX_BATCH = '10'; // Small batch for testing
    
    console.log('📋 Environment:');
    console.log('  NETWORK:', process.env.NETWORK);
    console.log('  HIGH_FUND_FLAG:', process.env.HIGH_FUND_FLAG);
    console.log('  ALL_FLAG:', process.env.ALL_FLAG);
    console.log('  MORALIS_API_KEY:', process.env.MORALIS_API_KEY ? 'SET' : 'NOT SET');
    
    const scanner = new FundUpdater();
    
    // Override fetchPortfolioWithMoralis to add more logging
    const originalFetch = scanner.fetchPortfolioWithMoralis.bind(scanner);
    scanner.fetchPortfolioWithMoralis = async function(address) {
        console.log(`\n📡 Fetching portfolio for: ${address}`);
        const result = await originalFetch(address);
        if (result) {
            console.log(`  ✅ API returned: $${result.totalUsdValue}`);
            console.log(`  💾 Will store: $${Math.floor(result.totalUsdValue)}`);
        } else {
            console.log(`  ❌ API failed`);
        }
        return result;
    };
    
    // Get addresses to update
    console.log('\n🔍 Getting outdated addresses...');
    const addresses = await scanner.getOutdatedAddresses();
    console.log(`📊 Found ${addresses.length} addresses to update`);
    
    if (addresses.length > 0) {
        console.log('🏛️ Top addresses to update:');
        addresses.slice(0, 5).forEach(addr => {
            console.log(`  - ${addr}`);
        });
        
        // Test specific problematic address if it's in the list
        const problematicAddr = '0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9';
        if (addresses.includes(problematicAddr)) {
            console.log(`\n⚠️  Problematic address ${problematicAddr} is in the update list!`);
            const portfolio = await scanner.fetchPortfolioWithMoralis(problematicAddr);
            if (portfolio) {
                console.log(`  Current calculation: $${portfolio.totalUsdValue}`);
                console.log(`  Will store in DB: $${Math.floor(portfolio.totalUsdValue)}`);
            }
        }
        
        // Update addresses
        console.log('\n🚀 Starting update process...');
        await scanner.updateAddressFunds(addresses);
        console.log('✅ Update completed');
    } else {
        console.log('✅ No addresses need updating');
    }
    
    // Clean up
    await scanner.db.end();
}

testFundUpdater().catch(console.error);
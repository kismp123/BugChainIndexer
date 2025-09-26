# Scanners - Blockchain Analysis Engine

> **High-performance multi-blockchain scanner with unified architecture**

The core analysis engine of BugChainIndexer. Streamlined to 3 core scanners and 4 common modules for maximum efficiency.

## 🏗️ Current Architecture

```
scanners/
├── core/               # Core scanners (3 components)
│   ├── UnifiedScanner.js    # Main analysis pipeline
│   ├── FundUpdater.js       # Asset balance tracking (Moralis API)  
│   └── DataRevalidator.js   # Data validation & retagging
├── common/             # Shared library (4 files)
│   ├── core.js         # Core blockchain functions
│   ├── database.js     # PostgreSQL operations
│   ├── Scanner.js      # Base scanner class
│   └── index.js        # Export hub
├── config/
│   ├── networks.js     # 18 network configurations
│   └── genesis-timestamps.js # Genesis block timestamps
├── tests/              # Test scripts (7 files)
│   ├── test-fundupdater-moralis.js
│   ├── test-moralis-single-api.js
│   └── ...
├── utils/              # Database utilities (4 files)
│   ├── db-optimize.js
│   ├── db-optimize-large.js
│   ├── db-cleanup.js
│   └── db-normalize-addresses.js
├── scripts/            # Production scripts (1 file)
│   └── production-db-optimizer.sh
├── cron/               # Automation scripts (10 files)
│   ├── setup-cron.sh
│   ├── cron-unified.sh
│   ├── cron-funds.sh
│   └── ...
└── run.sh              # Main executor
```

## 🚀 Quick Start

### Basic Operations
```bash
# Main blockchain analysis
./run.sh unified

# Update asset balances (using Moralis API)
./run.sh funds

# Validate existing data
./run.sh revalidate

# Run all scanners
./run.sh all
```

### Network-Specific Execution
```bash
# Recommended method
NETWORK=ethereum ./run.sh unified
NETWORK=polygon ./run.sh funds
NETWORK=arbitrum ./run.sh revalidate

# Alternative method
./run.sh unified auto ethereum
./run.sh funds auto polygon
```

## ⚙️ Configuration

### 1. Environment Setup
```bash
cp .env.example .env
```

### 2. Required API Keys
```bash
# Etherscan API keys (for all networks)
DEFAULT_ETHERSCAN_KEYS=key1,key2,key3

# Moralis API key (required for FundUpdater)
MORALIS_API_KEY=your_moralis_api_key

# Database configuration
PGHOST=localhost
PGPORT=5432
PGDATABASE=bugchain_indexer
PGUSER=your_user
PGPASSWORD=your_password
```

### 3. Optional Settings
```bash
# Scanner timeouts and intervals
TIMEOUT_SECONDS=7200           # Script timeout (2 hours)
FUNDUPDATEDELAY=7              # Days before fund update
FUND_UPDATE_MAX_BATCH=50000    # Max addresses per batch

# Execution flags
ALL_FLAG=true                  # Process all addresses
HIGH_FUND_FLAG=true            # Only high-value addresses (>100k)
```

## 📊 Core Components

### UnifiedScanner
**Main blockchain analysis pipeline**
- Transfer event scanning (ERC-20/721)
- Address discovery and normalization
- EOA vs Contract classification
- Contract verification via Etherscan
- Batch database operations

**Performance**: ~50,000 addresses/hour per network

### FundUpdater  
**Portfolio balance tracking via Moralis API**
- Uses Moralis `/wallets/{address}/tokens` endpoint
- Fetches native + ERC-20 token balances
- Calculates total USD portfolio value
- Network-specific balance tracking
- Batch processing with rate limiting

**Changes from previous version**:
- ✅ Now uses only Moralis API (removed CoinGecko, Binance, etc.)
- ✅ Simplified from 798 lines to 258 lines (68% reduction)
- ✅ Removed all price aggregation code
- ✅ Direct token balance fetching with USD values

### DataRevalidator
**Data consistency validation**
- Validates and tags existing addresses
- Classifies untagged addresses as Contract/EOA
- Batch processing (20,000 addresses/batch)
- Reuses UnifiedScanner's EOA filtering logic

## 🌐 Supported Networks (18)

| Network | Chain ID | Status | Moralis Support |
|---------|----------|--------|-----------------|
| Ethereum | 1 | ✅ Active | ✅ Yes |
| Binance Smart Chain | 56 | ✅ Active | ✅ Yes |
| Polygon | 137 | ✅ Active | ✅ Yes |
| Arbitrum | 42161 | ✅ Active | ✅ Yes |
| Optimism | 10 | ✅ Active | ✅ Yes |
| Base | 8453 | ✅ Active | ✅ Yes |
| Avalanche | 43114 | ✅ Active | ✅ Yes |
| Gnosis | 100 | ✅ Active | ✅ Yes |
| Cronos | 25 | ✅ Active | ✅ Yes |
| Linea | 59144 | ✅ Active | ✅ Yes |
| Scroll | 534352 | ✅ Active | ❌ No |
| Mantle | 5000 | ✅ Active | ❌ No |
| opBNB | 204 | ✅ Active | ❌ No |
| Polygon zkEVM | 1101 | ⚠️ Limited | ❌ No |
| Arbitrum Nova | 42170 | ⚠️ Limited | ❌ No |
| Celo | 42220 | ⚠️ Limited | ❌ No |
| Moonbeam | 1284 | ✅ Active | ✅ Yes |
| Moonriver | 1285 | ✅ Active | ✅ Yes |

**Note**: FundUpdater only works on networks supported by Moralis API.

## 🤖 Automation (Cron)

### Quick Setup
```bash
./cron/setup-cron.sh --auto-setup
```

### Schedule
- **Unified Scanner**: Every 4 hours
- **Fund Updates**: Every 6 hours  
- **Data Validation**: Weekly (Sunday 2 AM)
- **DB Optimization**: Daily (5 AM)
- **Log Cleanup**: Daily (4 AM)

### Manual Testing
```bash
./cron/cron-unified.sh      # Test unified scanner
./cron/cron-funds.sh        # Test fund updater
./cron/cron-revalidate.sh   # Test data validator
```

## 🔧 Database Management

### Optimization Tools
```bash
# Daily use (fast, no VACUUM)
./run.sh db-optimize-fast

# Weekly maintenance (with VACUUM)
./run.sh db-optimize

# Monthly for large DBs (>10GB)
./run.sh db-optimize-large

# Performance analysis
./run.sh db-analyze

# Clean up indexes
./run.sh db-cleanup

# Address normalization
./run.sh db-normalize-addresses
```

### Performance Improvements
- DataRevalidator: 455x faster (23.19s → 0.051s)
- FundUpdater: 17x faster (1.37s → 0.082s)
- UnifiedScanner: 9x faster (1.21s → 0.131s)

## 🧪 Testing

### Unit Tests
```bash
# Test Moralis integration
node tests/test-fundupdater-moralis.js
node tests/test-moralis-single-api.js

# Test RPC endpoints
node tests/test-all-rpcs.js
node tests/test-rpc-failover.js

# Test address handling
node tests/test-address-case.js
node tests/test-eoa-check.js
```

### Integration Testing
```bash
# Single network test
NETWORK=ethereum node core/FundUpdater.js

# With specific flags
ALL_FLAG=true NETWORK=ethereum ./run.sh funds
HIGH_FUND_FLAG=true ./run.sh funds-high
```

## 📁 File Structure Summary

### Core Files (Minimal)
- **3 Scanners**: UnifiedScanner, FundUpdater, DataRevalidator
- **4 Common modules**: core, database, Scanner, index
- **2 Config files**: networks, genesis-timestamps

### Support Files
- **7 Test scripts**: Focus on Moralis and RPC testing
- **4 DB utilities**: Optimization and maintenance
- **1 Production script**: DB optimizer
- **10 Cron scripts**: Automation

### Removed Files (Cleanup completed)
- ❌ 11 outdated test files removed
- ❌ 6 migration scripts removed  
- ❌ 3 unused utils removed
- ❌ 2 helper classes removed (MultiSourcePriceHelper, TokenDataLoader)
- ❌ All price aggregation code removed

## 🚨 Troubleshooting

### Common Issues
1. **Moralis API errors**: Check MORALIS_API_KEY in .env
2. **Database slow**: Run `./run.sh db-optimize-fast`
3. **RPC failures**: Check network config in `config/networks.js`
4. **Lock file issues**: Remove `/tmp/scanner-*.lock` files

### Performance Tips
- Use `HIGH_FUND_FLAG=true` for testing with fewer addresses
- Adjust `FUND_UPDATE_MAX_BATCH` for memory management
- Run DB optimization regularly
- Monitor logs in `logs/` directory

## 📈 Recent Changes (2025)

### Major Simplification
- FundUpdater reduced from 798 to 258 lines (68% reduction)
- Removed all price aggregation complexity
- Single API source (Moralis) for simplicity
- Cleaned up 20+ unused files

### Maintained Features
- All core scanning functionality intact
- Database optimization tools preserved
- Automation scripts maintained
- Test coverage for essential features

---

For detailed technical documentation, refer to individual component files and inline documentation.